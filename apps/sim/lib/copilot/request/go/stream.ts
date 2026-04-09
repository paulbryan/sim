import { createLogger } from '@sim/logger'
import { ORCHESTRATION_TIMEOUT_MS } from '@/lib/copilot/constants'
import {
  MothershipStreamV1EventType,
  MothershipStreamV1SpanLifecycleEvent,
  MothershipStreamV1SpanPayloadKind,
  MothershipStreamV1ToolPhase,
} from '@/lib/copilot/generated/mothership-stream-v1'
import { processSSEStream } from '@/lib/copilot/request/go/parser'
import {
  handleSubagentRouting,
  sseHandlers,
  subAgentHandlers,
} from '@/lib/copilot/request/handlers'
import { eventToStreamEvent, isEventRecord } from '@/lib/copilot/request/session'
import { shouldSkipToolCallEvent, shouldSkipToolResultEvent } from '@/lib/copilot/request/sse-utils'
import type {
  ExecutionContext,
  OrchestratorOptions,
  StreamEvent,
  StreamingContext,
} from '@/lib/copilot/request/types'
import { clearIntentsForWorkspace } from '@/lib/copilot/tools/server/files/file-intent-store'

const logger = createLogger('CopilotGoStream')

type FileIntent = {
  toolCallId: string
  operation: string
  target: { kind: string; fileId?: string; fileName?: string }
  title?: string
  contentType?: string
  edit?: Record<string, unknown>
}

type EditContentStreamState = {
  raw: string
  lastContentSnapshot?: string
}

/**
 * Decode a prefix of a JSON-encoded string value, handling escape sequences
 * that may be incomplete at the end of a streaming chunk.
 */
function decodeJsonStringPrefix(input: string): string {
  let output = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch !== '\\') {
      output += ch
      continue
    }
    const next = input[i + 1]
    if (!next) break
    if (next === 'n') {
      output += '\n'
      i++
      continue
    }
    if (next === 't') {
      output += '\t'
      i++
      continue
    }
    if (next === 'r') {
      output += '\r'
      i++
      continue
    }
    if (next === '"') {
      output += '"'
      i++
      continue
    }
    if (next === '\\') {
      output += '\\'
      i++
      continue
    }
    if (next === '/') {
      output += '/'
      i++
      continue
    }
    if (next === 'b') {
      output += '\b'
      i++
      continue
    }
    if (next === 'f') {
      output += '\f'
      i++
      continue
    }
    if (next === 'u') {
      const hex = input.slice(i + 2, i + 6)
      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) break
      output += String.fromCharCode(Number.parseInt(hex, 16))
      i += 5
      continue
    }
    break
  }
  return output
}

/**
 * Extract the streamed content string from edit_content's raw JSON args.
 * Since edit_content has a single field `content`, the JSON is always
 * `{"content":"..."}`. We find `"content":"` and decode everything after.
 */
function extractEditContent(raw: string): string {
  const marker = '"content":'
  const idx = raw.indexOf(marker)
  if (idx === -1) return ''
  const rest = raw.slice(idx + marker.length).trimStart()
  if (!rest.startsWith('"')) return rest
  let end = -1
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] === '\\') {
      i++
      continue
    }
    if (rest[i] === '"') {
      end = i
      break
    }
  }
  const inner = end === -1 ? rest.slice(1) : rest.slice(1, end)
  return decodeJsonStringPrefix(inner)
}

export class CopilotBackendError extends Error {
  status?: number
  body?: string

  constructor(message: string, options?: { status?: number; body?: string }) {
    super(message)
    this.name = 'CopilotBackendError'
    this.status = options?.status
    this.body = options?.body
  }
}

export class BillingLimitError extends Error {
  constructor(public readonly userId: string) {
    super('Usage limit reached')
    this.name = 'BillingLimitError'
  }
}

/**
 * Options for the shared stream processing loop.
 */
export interface StreamLoopOptions extends OrchestratorOptions {
  /**
   * Called for each normalized event BEFORE standard handler dispatch.
   * Return true to skip the default handler for this event.
   */
  onBeforeDispatch?: (event: StreamEvent, context: StreamingContext) => boolean | undefined
  /**
   * Called when the Go backend's trace ID (go_trace_id) is first received via SSE.
   */
  onGoTraceId?: (goTraceId: string) => void
}

/**
 * Run the SSE stream processing loop against the Go backend.
 *
 * Handles: fetch -> parse -> normalize -> dedupe -> subagent routing -> handler dispatch.
 * Callers provide the fetch URL/options and can intercept events via onBeforeDispatch.
 *
 * File preview streaming uses an intent-based approach:
 * 1. workspace_file phase:call → store intent (operation, target, edit metadata)
 * 2. edit_content phase:args_delta → stream content using stored intent
 * 3. edit_content phase:call → consume and clear intent
 */
export async function runStreamLoop(
  fetchUrl: string,
  fetchOptions: RequestInit,
  context: StreamingContext,
  execContext: ExecutionContext,
  options: StreamLoopOptions
): Promise<void> {
  const { timeout = ORCHESTRATION_TIMEOUT_MS, abortSignal } = options
  const editContentState = new Map<string, EditContentStreamState>()

  const fetchSpan = context.trace.startSpan(
    `HTTP Request → ${new URL(fetchUrl).pathname}`,
    'sim.http.fetch',
    { url: fetchUrl }
  )
  const response = await fetch(fetchUrl, {
    ...fetchOptions,
    signal: abortSignal,
  })

  if (!response.ok) {
    context.trace.endSpan(fetchSpan, 'error')
    const errorText = await response.text().catch(() => '')

    if (response.status === 402) {
      throw new BillingLimitError(execContext.userId)
    }

    throw new CopilotBackendError(
      `Copilot backend error (${response.status}): ${errorText || response.statusText}`,
      { status: response.status, body: errorText || response.statusText }
    )
  }

  if (!response.body) {
    context.trace.endSpan(fetchSpan, 'error')
    throw new CopilotBackendError('Copilot backend response missing body')
  }

  context.trace.endSpan(fetchSpan)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  const timeoutId = setTimeout(() => {
    context.errors.push('Request timed out')
    context.streamComplete = true
    reader.cancel().catch(() => {})
  }, timeout)

  try {
    await processSSEStream(reader, decoder, abortSignal, async (raw) => {
      if (abortSignal?.aborted) {
        context.wasAborted = true
        return true
      }

      if (!isEventRecord(raw)) {
        logger.warn('Received non-contract stream event on shared path; dropping event')
        return
      }

      const streamEvent = eventToStreamEvent(raw)
      if (raw.trace?.requestId) {
        const prev = context.requestId
        context.requestId = raw.trace.requestId
        context.trace.setGoTraceId(raw.trace.requestId)
        if (raw.trace.requestId !== prev) {
          options.onGoTraceId?.(raw.trace.requestId)
        }
      }

      if (shouldSkipToolCallEvent(streamEvent) || shouldSkipToolResultEvent(streamEvent)) {
        return
      }

      // ── workspace_file phase:call → store intent and emit preview metadata ──
      if (
        streamEvent.type === MothershipStreamV1EventType.tool &&
        streamEvent.payload.phase === MothershipStreamV1ToolPhase.call &&
        streamEvent.payload.toolName === 'workspace_file'
      ) {
        const toolCallId = streamEvent.payload.toolCallId as string | undefined
        const args = (streamEvent.payload.arguments ?? streamEvent.payload.input) as
          | Record<string, unknown>
          | undefined
        if (toolCallId && args) {
          const operation = args.operation as string | undefined
          const target = args.target as Record<string, unknown> | undefined
          const title = args.title as string | undefined
          const contentType = args.contentType as string | undefined
          const edit = args.edit as Record<string, unknown> | undefined

          if (operation && target) {
            const targetKind = target.kind as string
            const fileId = target.fileId as string | undefined
            const fileName = target.fileName as string | undefined

            const isContentOp =
              operation === 'append' || operation === 'update' || operation === 'patch'
            if (context.activeFileIntent && isContentOp) {
              logger.warn(
                'Orphaned workspace_file intent: content-op workspace_file arrived without edit_content for prior intent',
                {
                  orphanedToolCallId: context.activeFileIntent.toolCallId,
                  orphanedOperation: context.activeFileIntent.operation,
                  newToolCallId: toolCallId,
                  newOperation: operation,
                }
              )
              if (execContext.workspaceId) {
                const cleared = clearIntentsForWorkspace(execContext.workspaceId)
                if (cleared > 0) {
                  logger.warn('Cleared orphaned execution intents from store', {
                    cleared,
                    workspaceId: execContext.workspaceId,
                  })
                }
              }
            }

            context.activeFileIntent = {
              toolCallId,
              operation,
              target: {
                kind: targetKind,
                ...(fileId ? { fileId } : {}),
                ...(fileName ? { fileName } : {}),
              },
              ...(title ? { title } : {}),
              ...(contentType ? { contentType } : {}),
              ...(edit ? { edit } : {}),
            }

            const isDocFormat = /\.(pptx|docx|pdf)$/i.test(fileName ?? '')
            if (!isDocFormat && isContentOp) {
              const scope = streamEvent.scope ? { scope: streamEvent.scope } : {}
              await options.onEvent?.({
                type: MothershipStreamV1EventType.tool,
                payload: {
                  toolCallId,
                  toolName: 'workspace_file',
                  previewPhase: 'file_preview_start',
                },
                ...scope,
              })
              await options.onEvent?.({
                type: MothershipStreamV1EventType.tool,
                payload: {
                  toolCallId,
                  toolName: 'workspace_file',
                  previewPhase: 'file_preview_target',
                  operation,
                  target: {
                    kind: targetKind,
                    ...(fileId ? { fileId } : {}),
                    ...(fileName ? { fileName } : {}),
                  },
                  ...(title ? { title } : {}),
                },
                ...scope,
              })
              if (edit) {
                await options.onEvent?.({
                  type: MothershipStreamV1EventType.tool,
                  payload: {
                    toolCallId,
                    toolName: 'workspace_file',
                    previewPhase: 'file_preview_edit_meta',
                    edit,
                  },
                  ...scope,
                })
              }
            }
          }
        }
      }

      // ── edit_content phase:args_delta → stream content using stored intent ──
      if (
        streamEvent.type === MothershipStreamV1EventType.tool &&
        streamEvent.payload.phase === MothershipStreamV1ToolPhase.args_delta &&
        streamEvent.payload.toolName === 'edit_content' &&
        typeof streamEvent.payload.toolCallId === 'string' &&
        typeof streamEvent.payload.argumentsDelta === 'string'
      ) {
        const toolCallId = streamEvent.payload.toolCallId as string
        const delta = streamEvent.payload.argumentsDelta as string
        const state = editContentState.get(toolCallId) ?? { raw: '' }
        state.raw += delta

        if (context.activeFileIntent) {
          const isDocFormat = /\.(pptx|docx|pdf)$/i.test(
            context.activeFileIntent.target.fileName ?? ''
          )
          if (!isDocFormat) {
            const streamedContent = extractEditContent(state.raw)
            if (streamedContent !== (state.lastContentSnapshot ?? '')) {
              state.lastContentSnapshot = streamedContent
              await options.onEvent?.({
                type: MothershipStreamV1EventType.tool,
                payload: {
                  toolCallId: context.activeFileIntent.toolCallId,
                  toolName: 'workspace_file',
                  previewPhase: 'file_preview_content',
                  content: streamedContent,
                  contentMode: 'snapshot',
                },
                ...(streamEvent.scope ? { scope: streamEvent.scope } : {}),
              })
            }
          }
        }

        editContentState.set(toolCallId, state)
      }

      // ── edit_content phase:call → keep intent until result for preview completion ──
      if (
        streamEvent.type === MothershipStreamV1EventType.tool &&
        streamEvent.payload.phase === MothershipStreamV1ToolPhase.call &&
        streamEvent.payload.toolName === 'edit_content'
      ) {
        const toolCallId = streamEvent.payload.toolCallId as string | undefined
        if (toolCallId) {
          editContentState.delete(toolCallId)
        }
      }

      // ── edit_content phase:result → complete preview and clear intent ──
      if (
        streamEvent.type === MothershipStreamV1EventType.tool &&
        streamEvent.payload.phase === MothershipStreamV1ToolPhase.result &&
        streamEvent.payload.toolName === 'edit_content' &&
        context.activeFileIntent
      ) {
        await options.onEvent?.({
          type: MothershipStreamV1EventType.tool,
          payload: {
            toolCallId: context.activeFileIntent.toolCallId,
            toolName: 'workspace_file',
            previewPhase: 'file_preview_complete',
            fileId: context.activeFileIntent.target.fileId,
            data:
              streamEvent.payload.result !== undefined
                ? streamEvent.payload.result
                : streamEvent.payload.data,
          },
          ...(streamEvent.scope ? { scope: streamEvent.scope } : {}),
        })
        context.activeFileIntent = null
      }

      try {
        await options.onEvent?.(streamEvent)
      } catch (error) {
        logger.warn('Failed to forward stream event', {
          type: streamEvent.type,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      // Yield a macrotask so Node.js flushes the HTTP response buffer to
      // the browser. Microtask yields (await Promise.resolve()) are not
      // enough — the I/O layer needs a full event loop tick to write.
      await new Promise<void>((resolve) => setImmediate(resolve))

      if (options.onBeforeDispatch?.(streamEvent, context)) {
        return context.streamComplete || undefined
      }

      if (
        streamEvent.type === MothershipStreamV1EventType.span &&
        streamEvent.payload.kind === MothershipStreamV1SpanPayloadKind.subagent
      ) {
        const spanData =
          streamEvent.payload.data &&
          typeof streamEvent.payload.data === 'object' &&
          !Array.isArray(streamEvent.payload.data)
            ? (streamEvent.payload.data as Record<string, unknown>)
            : undefined
        const toolCallId =
          (streamEvent.payload.parentToolCallId as string | undefined) ||
          (spanData?.tool_call_id as string | undefined)
        const subagentName = streamEvent.payload.agent as string | undefined
        const spanEvt = streamEvent.payload.event as string | undefined
        const isPendingPause = spanData?.pending === true
        if (spanEvt === MothershipStreamV1SpanLifecycleEvent.start) {
          const lastParent = context.subAgentParentStack[context.subAgentParentStack.length - 1]
          const lastBlock = context.contentBlocks[context.contentBlocks.length - 1]
          if (toolCallId) {
            if (lastParent !== toolCallId) {
              context.subAgentParentStack.push(toolCallId)
            }
            context.subAgentParentToolCallId = toolCallId
            context.subAgentContent[toolCallId] ??= ''
            context.subAgentToolCalls[toolCallId] ??= []
          }
          if (
            subagentName &&
            !(
              lastParent === toolCallId &&
              lastBlock?.type === 'subagent' &&
              lastBlock.content === subagentName
            )
          ) {
            context.contentBlocks.push({
              type: 'subagent',
              content: subagentName,
              timestamp: Date.now(),
            })
          }
          return
        }
        if (spanEvt === MothershipStreamV1SpanLifecycleEvent.end) {
          if (isPendingPause) {
            return
          }
          if (context.subAgentParentStack.length > 0) {
            context.subAgentParentStack.pop()
          } else {
            logger.warn('subagent end without matching start')
          }
          context.subAgentParentToolCallId =
            context.subAgentParentStack.length > 0
              ? context.subAgentParentStack[context.subAgentParentStack.length - 1]
              : undefined
          return
        }
      }

      if (handleSubagentRouting(streamEvent, context)) {
        const handler = subAgentHandlers[streamEvent.type]
        if (handler) {
          await handler(streamEvent, context, execContext, options)
        }
        return context.streamComplete || undefined
      }

      const handler = sseHandlers[streamEvent.type]
      if (handler) {
        await handler(streamEvent, context, execContext, options)
      }
      return context.streamComplete || undefined
    })
  } finally {
    if (abortSignal?.aborted) {
      context.wasAborted = true
      await reader.cancel().catch(() => {})
    }
    clearTimeout(timeoutId)
  }
}

import { createLogger } from '@sim/logger'
import { ORCHESTRATION_TIMEOUT_MS } from '@/lib/copilot/constants'
import {
  MothershipStreamV1EventType,
  MothershipStreamV1SpanLifecycleEvent,
  MothershipStreamV1SpanPayloadKind,
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

const logger = createLogger('CopilotGoStream')

type FilePreviewServerState = {
  raw: string
  started: boolean
  operation?: string
  targetKind?: string
  fileId?: string
  fileName?: string
  title?: string
  editMetaKey?: string
  targetKey?: string
  lastContentSnapshot?: string
}

function extractJsonString(raw: string, key: string): string | undefined {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"`)
  const m = pattern.exec(raw)
  if (!m) return undefined
  const start = m.index + m[0].length
  let end = -1
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '\\') {
      i++
      continue
    }
    if (raw[i] === '"') {
      end = i
      break
    }
  }
  if (end === -1) return undefined
  return raw
    .slice(start, end)
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\\\/g, '\\')
}

function extractJsonBoolean(raw: string, key: string): boolean | undefined {
  const match = raw.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`))
  if (!match) return undefined
  return match[1] === 'true'
}

function extractJsonNumber(raw: string, key: string): number | undefined {
  const match = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`))
  if (!match) return undefined
  return Number.parseInt(match[1], 10)
}

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
      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
        break
      }
      output += String.fromCharCode(Number.parseInt(hex, 16))
      i += 5
      continue
    }
    break
  }
  return output
}

function extractStreamedContent(raw: string, preferredKey: 'content' | 'replace'): string {
  const marker = `"${preferredKey}":`
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

function buildPreviewContent(raw: string, strategy?: string): string {
  if (strategy === 'search_replace') {
    return extractStreamedContent(raw, 'replace')
  }
  return extractStreamedContent(raw, 'content')
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
}

/**
 * Run the SSE stream processing loop against the Go backend.
 *
 * Handles: fetch -> parse -> normalize -> dedupe -> subagent routing -> handler dispatch.
 * Callers provide the fetch URL/options and can intercept events via onBeforeDispatch.
 *
 * Optimised hot path: text events (the most frequent) bypass tool-call dedup
 * checks and are dispatched synchronously without any await, eliminating ~4
 * microtask yields per text event vs the previous async-generator + await chain.
 */
export async function runStreamLoop(
  fetchUrl: string,
  fetchOptions: RequestInit,
  context: StreamingContext,
  execContext: ExecutionContext,
  options: StreamLoopOptions
): Promise<void> {
  const { timeout = ORCHESTRATION_TIMEOUT_MS, abortSignal } = options
  const filePreviewState = new Map<string, FilePreviewServerState>()

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
        context.requestId = raw.trace.requestId
        context.trace.setGoTraceId(raw.trace.requestId)
      }

      if (shouldSkipToolCallEvent(streamEvent) || shouldSkipToolResultEvent(streamEvent)) {
        return
      }

      if (
        streamEvent.type === MothershipStreamV1EventType.text &&
        typeof streamEvent.payload.text === 'string'
      ) {
        await options.onEvent?.(streamEvent)
        return
      }

      if (
        streamEvent.type === MothershipStreamV1EventType.tool &&
        streamEvent.payload.phase === 'args_delta' &&
        streamEvent.payload.toolName === 'workspace_file' &&
        typeof streamEvent.payload.toolCallId === 'string' &&
        typeof streamEvent.payload.argumentsDelta === 'string'
      ) {
        const toolCallId = streamEvent.payload.toolCallId as string
        const delta = streamEvent.payload.argumentsDelta as string
        const state = filePreviewState.get(toolCallId) ?? {
          raw: '',
          started: false,
        }
        state.raw += delta

        const operation = extractJsonString(state.raw, 'operation')
        const targetKind = extractJsonString(state.raw, 'kind')
        const fileId = extractJsonString(state.raw, 'fileId')
        const fileName = extractJsonString(state.raw, 'fileName')
        const title = extractJsonString(state.raw, 'title')
        if (operation) state.operation = operation
        if (targetKind) state.targetKind = targetKind
        if (fileId) state.fileId = fileId
        if (fileName) state.fileName = fileName
        if (title) state.title = title

        const isDocFormat = /\.(pptx|docx|pdf)$/i.test(state.fileName ?? '')
        if (!isDocFormat) {
          if (!state.started) {
            state.started = true
            await options.onEvent?.({
              type: MothershipStreamV1EventType.tool,
              payload: {
                toolCallId,
                toolName: 'workspace_file',
                previewPhase: 'file_preview_start',
              },
              ...(streamEvent.scope ? { scope: streamEvent.scope } : {}),
            })
          }

          const targetKey = JSON.stringify({
            operation: state.operation,
            targetKind: state.targetKind,
            fileId: state.fileId,
            fileName: state.fileName,
            title: state.title,
          })
          if (
            state.targetKind &&
            (state.targetKind === 'new_file' ? !!state.fileName : !!state.fileId) &&
            state.targetKey !== targetKey
          ) {
            state.targetKey = targetKey
            await options.onEvent?.({
              type: MothershipStreamV1EventType.tool,
              payload: {
                toolCallId,
                toolName: 'workspace_file',
                previewPhase: 'file_preview_target',
                operation: state.operation,
                target: {
                  kind: state.targetKind,
                  ...(state.fileId ? { fileId: state.fileId } : {}),
                  ...(state.fileName ? { fileName: state.fileName } : {}),
                },
                ...(state.title ? { title: state.title } : {}),
              },
              ...(streamEvent.scope ? { scope: streamEvent.scope } : {}),
            })
          }

          const strategy = extractJsonString(state.raw, 'strategy')
          const editMetaPayload = strategy
            ? {
                strategy,
                ...(extractJsonString(state.raw, 'mode')
                  ? { mode: extractJsonString(state.raw, 'mode') }
                  : {}),
                ...(extractJsonNumber(state.raw, 'occurrence') !== undefined
                  ? { occurrence: extractJsonNumber(state.raw, 'occurrence') }
                  : {}),
                ...(extractJsonString(state.raw, 'search')
                  ? { search: extractJsonString(state.raw, 'search') }
                  : {}),
                ...(extractJsonBoolean(state.raw, 'replaceAll') !== undefined
                  ? { replaceAll: extractJsonBoolean(state.raw, 'replaceAll') }
                  : {}),
                ...(extractJsonString(state.raw, 'before_anchor')
                  ? { before_anchor: extractJsonString(state.raw, 'before_anchor') }
                  : {}),
                ...(extractJsonString(state.raw, 'after_anchor')
                  ? { after_anchor: extractJsonString(state.raw, 'after_anchor') }
                  : {}),
                ...(extractJsonString(state.raw, 'anchor')
                  ? { anchor: extractJsonString(state.raw, 'anchor') }
                  : {}),
                ...(extractJsonString(state.raw, 'start_anchor')
                  ? { start_anchor: extractJsonString(state.raw, 'start_anchor') }
                  : {}),
                ...(extractJsonString(state.raw, 'end_anchor')
                  ? { end_anchor: extractJsonString(state.raw, 'end_anchor') }
                  : {}),
              }
            : undefined
          const editMetaKey = editMetaPayload ? JSON.stringify(editMetaPayload) : undefined
          if (editMetaPayload && state.editMetaKey !== editMetaKey) {
            state.editMetaKey = editMetaKey
            await options.onEvent?.({
              type: MothershipStreamV1EventType.tool,
              payload: {
                toolCallId,
                toolName: 'workspace_file',
                previewPhase: 'file_preview_edit_meta',
                edit: editMetaPayload,
              },
              ...(streamEvent.scope ? { scope: streamEvent.scope } : {}),
            })
          }

          const streamedContent = buildPreviewContent(state.raw, strategy)
          if (streamedContent !== (state.lastContentSnapshot ?? '')) {
            state.lastContentSnapshot = streamedContent
            await options.onEvent?.({
              type: MothershipStreamV1EventType.tool,
              payload: {
                toolCallId,
                toolName: 'workspace_file',
                previewPhase: 'file_preview_content',
                content: streamedContent,
                contentMode: 'snapshot',
              },
              ...(streamEvent.scope ? { scope: streamEvent.scope } : {}),
            })
          }
        } // end if (!isDocFormat)

        filePreviewState.set(toolCallId, state)
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
          handler(streamEvent, context, execContext, options)
        }
        return context.streamComplete || undefined
      }

      const handler = sseHandlers[streamEvent.type]
      if (handler) {
        handler(streamEvent, context, execContext, options)
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

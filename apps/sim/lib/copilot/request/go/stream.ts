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
import {
  createFilePreviewSession,
  eventToStreamEvent,
  type FilePreviewContentMode,
  type FilePreviewSession,
  isEventRecord,
  upsertFilePreviewSession,
} from '@/lib/copilot/request/session'
import { shouldSkipToolCallEvent, shouldSkipToolResultEvent } from '@/lib/copilot/request/sse-utils'
import type {
  ExecutionContext,
  OrchestratorOptions,
  StreamEvent,
  StreamingContext,
} from '@/lib/copilot/request/types'
import {
  clearIntentsForWorkspace,
  peekFileIntent,
} from '@/lib/copilot/tools/server/files/file-intent-store'
import {
  buildFilePreviewText,
  loadWorkspaceFileTextForPreview,
} from '@/lib/copilot/tools/server/files/file-preview'

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

type FilePreviewStreamState = {
  session: FilePreviewSession
  lastEmittedPreviewText: string
  lastSnapshotAt: number
}

const PATCH_PREVIEW_SNAPSHOT_INTERVAL_MS = 80
const DELTA_PREVIEW_CHECKPOINT_INTERVAL_MS = 1000

/**
 * Decode a prefix of a JSON-encoded string value, handling escape sequences
 * that may be incomplete at the end of a streaming chunk.
 */
export function decodeJsonStringPrefix(input: string): string {
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
export function extractEditContent(raw: string): string {
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

function isContentOperation(
  operation: string | undefined
): operation is 'append' | 'update' | 'patch' {
  return operation === 'append' || operation === 'update' || operation === 'patch'
}

function isDocFormat(fileName: string | undefined): boolean {
  return /\.(pptx|docx|pdf)$/i.test(fileName ?? '')
}

function buildPreviewSessionFromIntent(
  streamId: string,
  intent: FileIntent,
  current?: FilePreviewSession
): FilePreviewSession {
  return createFilePreviewSession({
    streamId,
    toolCallId: intent.toolCallId,
    fileName: intent.target.fileName ?? current?.fileName,
    ...(intent.target.fileId ? { fileId: intent.target.fileId } : {}),
    ...(intent.target.kind === 'new_file' || intent.target.kind === 'file_id'
      ? { targetKind: intent.target.kind }
      : {}),
    operation: intent.operation,
    ...(intent.edit ? { edit: intent.edit } : {}),
    ...(typeof current?.baseContent === 'string' ? { baseContent: current.baseContent } : {}),
    previewText: current?.previewText ?? '',
    previewVersion: current?.previewVersion ?? 0,
    status: current?.status ?? 'pending',
    completedAt: current?.completedAt,
  })
}

async function persistFilePreviewSession(session: FilePreviewSession): Promise<void> {
  try {
    await upsertFilePreviewSession(session)
  } catch (error) {
    logger.warn('Failed to persist file preview session', {
      streamId: session.streamId,
      toolCallId: session.toolCallId,
      previewVersion: session.previewVersion,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Chooses snapshot vs delta emission for `file_preview_content`.
 *
 * **Append** always uses snapshot mode: the sidebar `FileViewer` gets `streamingMode: 'replace'`
 * and must receive the full composed document every tick. Delta mode saved bandwidth but required
 * merging chunks with `prevSession.previewText`, which could desync and look like mid-stream overwrites.
 */
export function buildPreviewContentUpdate(
  previousText: string,
  nextText: string,
  lastSnapshotAt: number,
  now: number,
  operation: string | undefined
): { content: string; contentMode: FilePreviewContentMode; lastSnapshotAt: number } {
  const shouldForceSnapshot =
    previousText.length === 0 ||
    !nextText.startsWith(previousText) ||
    operation === 'patch' ||
    operation === 'append' ||
    now - lastSnapshotAt >= DELTA_PREVIEW_CHECKPOINT_INTERVAL_MS

  if (shouldForceSnapshot) {
    return {
      content: nextText,
      contentMode: 'snapshot',
      lastSnapshotAt: now,
    }
  }

  return {
    content: nextText.slice(previousText.length),
    contentMode: 'delta',
    lastSnapshotAt,
  }
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
 * File preview streaming:
 * 1. workspace_file phase:call → active intent + load base file text for append/patch (awaited here so
 *    it cannot race edit_content args_delta; tool executor still stores Redis intent async)
 * 2. edit_content phase:args_delta → stream preview from base + streamed content
 * 3. edit_content phase:result → complete preview; edit_content tool consumes Redis intent
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
  const filePreviewState = new Map<string, FilePreviewStreamState>()

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

            const isContentOp = isContentOperation(operation)
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
                const cleared = await clearIntentsForWorkspace(execContext.workspaceId, {
                  chatId: execContext.chatId,
                  messageId: execContext.messageId,
                })
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

            if (!isDocFormat(fileName) && isContentOp) {
              let previewBaseContent: string | undefined
              if (
                execContext.workspaceId &&
                fileId &&
                (operation === 'append' || operation === 'patch')
              ) {
                previewBaseContent = await loadWorkspaceFileTextForPreview(
                  execContext.workspaceId,
                  fileId
                )
              }

              let session = buildPreviewSessionFromIntent(
                raw.stream.streamId,
                context.activeFileIntent
              )
              if (previewBaseContent !== undefined) {
                session = { ...session, baseContent: previewBaseContent }
              }
              filePreviewState.set(toolCallId, {
                session,
                lastEmittedPreviewText: '',
                lastSnapshotAt: 0,
              })
              await persistFilePreviewSession(session)
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

      if (
        streamEvent.type === MothershipStreamV1EventType.tool &&
        streamEvent.payload.phase === MothershipStreamV1ToolPhase.result &&
        streamEvent.payload.toolName === 'workspace_file' &&
        context.activeFileIntent &&
        isContentOperation(context.activeFileIntent.operation) &&
        context.activeFileIntent.operation === 'patch' &&
        context.activeFileIntent.edit?.strategy === 'anchored' &&
        context.activeFileIntent.edit?.mode === 'delete_between' &&
        execContext.workspaceId &&
        context.activeFileIntent.target.fileId &&
        !isDocFormat(context.activeFileIntent.target.fileName)
      ) {
        const currentPreview = filePreviewState.get(context.activeFileIntent.toolCallId)
        const previewText = buildFilePreviewText({
          operation: 'patch',
          streamedContent: '',
          existingContent: currentPreview?.session.baseContent,
          edit: currentPreview?.session.edit as Record<string, unknown> | undefined,
        })

        if (previewText !== undefined) {
          const baseSession = buildPreviewSessionFromIntent(
            raw.stream.streamId,
            context.activeFileIntent,
            currentPreview?.session
          )
          const nextSession: FilePreviewSession = {
            ...baseSession,
            status: 'streaming',
            previewText,
            previewVersion: (currentPreview?.session.previewVersion ?? 0) + 1,
            updatedAt: new Date().toISOString(),
          }
          filePreviewState.set(context.activeFileIntent.toolCallId, {
            session: nextSession,
            lastEmittedPreviewText: previewText,
            lastSnapshotAt: Date.now(),
          })
          await persistFilePreviewSession(nextSession)
          await options.onEvent?.({
            type: MothershipStreamV1EventType.tool,
            payload: {
              toolCallId: nextSession.toolCallId,
              toolName: 'workspace_file',
              previewPhase: 'file_preview_content',
              content: previewText,
              contentMode: 'snapshot',
              previewVersion: nextSession.previewVersion,
              fileName: nextSession.fileName,
              ...(nextSession.fileId ? { fileId: nextSession.fileId } : {}),
              ...(nextSession.targetKind ? { targetKind: nextSession.targetKind } : {}),
              ...(nextSession.operation ? { operation: nextSession.operation } : {}),
              ...(nextSession.edit ? { edit: nextSession.edit } : {}),
            },
            ...(streamEvent.scope ? { scope: streamEvent.scope } : {}),
          })
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
          if (!isDocFormat(context.activeFileIntent.target.fileName)) {
            const streamedContent = extractEditContent(state.raw)
            if (streamedContent !== (state.lastContentSnapshot ?? '')) {
              state.lastContentSnapshot = streamedContent
              let currentPreview = filePreviewState.get(context.activeFileIntent.toolCallId) ?? {
                session: buildPreviewSessionFromIntent(
                  raw.stream.streamId,
                  context.activeFileIntent
                ),
                lastEmittedPreviewText: '',
                lastSnapshotAt: 0,
              }

              /**
               * Fallback: primary base is set on `workspace_file` call via
               * {@link loadWorkspaceFileTextForPreview}. This only runs when that load failed or
               * hydrated sessions lack `baseContent`, once Redis intent is available.
               */
              if (
                currentPreview.session.baseContent === undefined &&
                (context.activeFileIntent.operation === 'append' ||
                  context.activeFileIntent.operation === 'patch') &&
                execContext.workspaceId &&
                context.activeFileIntent.target.fileId
              ) {
                const intentBase = await peekFileIntent(
                  execContext.workspaceId,
                  context.activeFileIntent.target.fileId,
                  {
                    chatId: execContext.chatId,
                    messageId: execContext.messageId,
                  }
                )
                if (typeof intentBase?.existingContent === 'string') {
                  const seededSession: FilePreviewSession = {
                    ...currentPreview.session,
                    baseContent: intentBase.existingContent,
                    ...(intentBase.edit
                      ? { edit: intentBase.edit as Record<string, unknown> }
                      : {}),
                  }
                  currentPreview = {
                    ...currentPreview,
                    session: seededSession,
                  }
                  filePreviewState.set(context.activeFileIntent.toolCallId, currentPreview)
                  await persistFilePreviewSession(seededSession)
                }
              }

              const previewText = buildFilePreviewText({
                operation: context.activeFileIntent.operation as 'append' | 'update' | 'patch',
                streamedContent,
                existingContent: currentPreview.session.baseContent,
                edit: currentPreview.session.edit as Record<string, unknown> | undefined,
              })

              if (previewText !== undefined) {
                const baseSession = buildPreviewSessionFromIntent(
                  raw.stream.streamId,
                  context.activeFileIntent,
                  currentPreview?.session
                )
                const now = Date.now()
                const nextSession: FilePreviewSession = {
                  ...baseSession,
                  status: 'streaming',
                  previewText,
                  previewVersion: (currentPreview?.session.previewVersion ?? 0) + 1,
                  updatedAt: new Date(now).toISOString(),
                }

                await persistFilePreviewSession(nextSession)

                if (
                  nextSession.operation === 'patch' &&
                  now - (currentPreview?.lastSnapshotAt ?? 0) < PATCH_PREVIEW_SNAPSHOT_INTERVAL_MS
                ) {
                  filePreviewState.set(context.activeFileIntent.toolCallId, {
                    session: nextSession,
                    lastEmittedPreviewText: currentPreview?.lastEmittedPreviewText ?? '',
                    lastSnapshotAt: currentPreview?.lastSnapshotAt ?? 0,
                  })
                } else {
                  const previewUpdate = buildPreviewContentUpdate(
                    currentPreview?.lastEmittedPreviewText ?? '',
                    nextSession.previewText,
                    currentPreview?.lastSnapshotAt ?? 0,
                    now,
                    nextSession.operation
                  )

                  filePreviewState.set(context.activeFileIntent.toolCallId, {
                    session: nextSession,
                    lastEmittedPreviewText: nextSession.previewText,
                    lastSnapshotAt: previewUpdate.lastSnapshotAt,
                  })

                  await options.onEvent?.({
                    type: MothershipStreamV1EventType.tool,
                    payload: {
                      toolCallId: nextSession.toolCallId,
                      toolName: 'workspace_file',
                      previewPhase: 'file_preview_content',
                      content: previewUpdate.content,
                      contentMode: previewUpdate.contentMode,
                      previewVersion: nextSession.previewVersion,
                      fileName: nextSession.fileName,
                      ...(nextSession.fileId ? { fileId: nextSession.fileId } : {}),
                      ...(nextSession.targetKind ? { targetKind: nextSession.targetKind } : {}),
                      ...(nextSession.operation ? { operation: nextSession.operation } : {}),
                      ...(nextSession.edit ? { edit: nextSession.edit } : {}),
                    },
                    ...(streamEvent.scope ? { scope: streamEvent.scope } : {}),
                  })
                }
              } else {
                filePreviewState.set(context.activeFileIntent.toolCallId, {
                  session: currentPreview.session,
                  lastEmittedPreviewText: currentPreview.lastEmittedPreviewText,
                  lastSnapshotAt: currentPreview.lastSnapshotAt,
                })
              }
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
        const currentPreview = filePreviewState.get(context.activeFileIntent.toolCallId)
        const completedAt = new Date().toISOString()

        if (
          currentPreview &&
          currentPreview.lastEmittedPreviewText !== currentPreview.session.previewText &&
          currentPreview.session.previewText.length > 0
        ) {
          filePreviewState.set(context.activeFileIntent.toolCallId, {
            session: currentPreview.session,
            lastEmittedPreviewText: currentPreview.session.previewText,
            lastSnapshotAt: Date.now(),
          })
          await options.onEvent?.({
            type: MothershipStreamV1EventType.tool,
            payload: {
              toolCallId: currentPreview.session.toolCallId,
              toolName: 'workspace_file',
              previewPhase: 'file_preview_content',
              content: currentPreview.session.previewText,
              contentMode: 'snapshot',
              previewVersion: currentPreview.session.previewVersion,
              fileName: currentPreview.session.fileName,
              ...(currentPreview.session.fileId ? { fileId: currentPreview.session.fileId } : {}),
              ...(currentPreview.session.targetKind
                ? { targetKind: currentPreview.session.targetKind }
                : {}),
              ...(currentPreview.session.operation
                ? { operation: currentPreview.session.operation }
                : {}),
              ...(currentPreview.session.edit ? { edit: currentPreview.session.edit } : {}),
            },
            ...(streamEvent.scope ? { scope: streamEvent.scope } : {}),
          })
        }

        if (currentPreview) {
          const completedSession: FilePreviewSession = {
            ...currentPreview.session,
            status: 'complete',
            updatedAt: completedAt,
            completedAt,
          }
          filePreviewState.set(context.activeFileIntent.toolCallId, {
            session: completedSession,
            lastEmittedPreviewText: completedSession.previewText,
            lastSnapshotAt: Date.now(),
          })
          await persistFilePreviewSession(completedSession)
        }

        await options.onEvent?.({
          type: MothershipStreamV1EventType.tool,
          payload: {
            toolCallId: context.activeFileIntent.toolCallId,
            toolName: 'workspace_file',
            previewPhase: 'file_preview_complete',
            fileId: context.activeFileIntent.target.fileId,
            output: streamEvent.payload.output,
            ...(currentPreview ? { previewVersion: currentPreview.session.previewVersion } : {}),
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

import type { CopilotAsyncToolStatus } from '@sim/db/schema'

export const ASYNC_TOOL_STATUS = {
  pending: 'pending',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  resumeEnqueued: 'resume_enqueued',
  resumed: 'resumed',
} as const

export type AsyncLifecycleStatus =
  | typeof ASYNC_TOOL_STATUS.pending
  | typeof ASYNC_TOOL_STATUS.running
  | typeof ASYNC_TOOL_STATUS.completed
  | typeof ASYNC_TOOL_STATUS.failed
  | typeof ASYNC_TOOL_STATUS.cancelled

export type AsyncTerminalStatus =
  | typeof ASYNC_TOOL_STATUS.completed
  | typeof ASYNC_TOOL_STATUS.failed
  | typeof ASYNC_TOOL_STATUS.cancelled

export interface AsyncCompletionEnvelope {
  toolCallId: string
  status: string
  message?: string
  data?: Record<string, unknown>
  runId?: string
  checkpointId?: string
  executionId?: string
  chatId?: string
  timestamp?: string
}

export function isTerminalAsyncStatus(
  status: CopilotAsyncToolStatus | AsyncLifecycleStatus | string | null | undefined
): status is AsyncTerminalStatus {
  return (
    status === ASYNC_TOOL_STATUS.completed ||
    status === ASYNC_TOOL_STATUS.failed ||
    status === ASYNC_TOOL_STATUS.cancelled
  )
}

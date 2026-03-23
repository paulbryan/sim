import { createLogger } from '@sim/logger'
import type { AsyncCompletionEnvelope } from '@/lib/copilot/async-runs/lifecycle'
import { getAsyncToolCalls } from '@/lib/copilot/async-runs/repository'
import { REDIS_TOOL_CALL_PREFIX } from '@/lib/copilot/constants'
import { getRedisClient } from '@/lib/core/config/redis'
import { createPubSubChannel } from '@/lib/events/pubsub'

const logger = createLogger('CopilotOrchestratorPersistence')

const toolConfirmationChannel = createPubSubChannel<AsyncCompletionEnvelope>({
  channel: 'copilot:tool-confirmation',
  label: 'CopilotToolConfirmation',
})

/**
 * Get a tool call confirmation status from Redis.
 */
export async function getToolConfirmation(toolCallId: string): Promise<{
  status: string
  message?: string
  timestamp?: string
  data?: Record<string, unknown>
} | null> {
  const redis = getRedisClient()
  if (!redis) {
    const [row] = await getAsyncToolCalls([toolCallId]).catch(() => [])
    if (!row) return null
    return {
      status:
        row.status === 'completed' ? 'success' : row.status === 'failed' ? 'error' : row.status,
      message: row.error || undefined,
      data: (row.result as Record<string, unknown> | null) || undefined,
    }
  }

  try {
    const raw = await redis.get(`${REDIS_TOOL_CALL_PREFIX}${toolCallId}`)
    if (!raw) return null
    return JSON.parse(raw) as {
      status: string
      message?: string
      timestamp?: string
      data?: Record<string, unknown>
    }
  } catch (error) {
    logger.error('Failed to read tool confirmation', {
      toolCallId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export function publishToolConfirmation(event: AsyncCompletionEnvelope): void {
  logger.info('Publishing tool confirmation event', {
    toolCallId: event.toolCallId,
    status: event.status,
  })
  toolConfirmationChannel.publish(event)
}

export async function waitForToolConfirmation(
  toolCallId: string,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<{
  status: string
  message?: string
  timestamp?: string
  data?: Record<string, unknown>
} | null> {
  const existing = await getToolConfirmation(toolCallId)
  if (existing) {
    logger.info('Resolved tool confirmation immediately', {
      toolCallId,
      status: existing.status,
    })
    return existing
  }

  return new Promise((resolve) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let unsubscribe: (() => void) | null = null

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (unsubscribe) unsubscribe()
      abortSignal?.removeEventListener('abort', onAbort)
    }

    const settle = (
      value: {
        status: string
        message?: string
        timestamp?: string
        data?: Record<string, unknown>
      } | null
    ) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    const onAbort = () => settle(null)

    unsubscribe = toolConfirmationChannel.subscribe((event) => {
      if (event.toolCallId !== toolCallId) return
      logger.info('Resolved tool confirmation from pubsub', {
        toolCallId,
        status: event.status,
      })
      settle({
        status: event.status,
        message: event.message,
        timestamp: event.timestamp,
        data: event.data,
      })
    })

    timeoutId = setTimeout(() => settle(null), timeoutMs)
    if (abortSignal?.aborted) {
      settle(null)
      return
    }
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    void getToolConfirmation(toolCallId).then((latest) => {
      if (latest) {
        logger.info('Resolved tool confirmation after subscribe', {
          toolCallId,
          status: latest.status,
        })
        settle(latest)
      }
    })
  })
}

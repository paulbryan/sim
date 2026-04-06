import { createLogger } from '@sim/logger'
import { NextResponse } from 'next/server'
import type {
  EventMatchContext,
  FormatInputContext,
  FormatInputResult,
  WebhookProviderHandler,
} from '@/lib/webhooks/providers/types'

const logger = createLogger('WebhookProvider:Greenhouse')

export const greenhouseHandler: WebhookProviderHandler = {
  async formatInput({ body }: FormatInputContext): Promise<FormatInputResult> {
    const b = body as Record<string, unknown>
    return {
      input: {
        action: b.action,
        payload: b.payload || {},
      },
    }
  },

  async matchEvent({ webhook, body, requestId, providerConfig }: EventMatchContext) {
    const triggerId = providerConfig.triggerId as string | undefined
    const b = body as Record<string, unknown>
    const action = b.action as string | undefined

    if (triggerId && triggerId !== 'greenhouse_webhook') {
      const { isGreenhouseEventMatch } = await import('@/triggers/greenhouse/utils')
      if (!isGreenhouseEventMatch(triggerId, action || '')) {
        logger.debug(
          `[${requestId}] Greenhouse event mismatch for trigger ${triggerId}. Action: ${action}. Skipping execution.`,
          {
            webhookId: webhook.id,
            triggerId,
            receivedAction: action,
          }
        )

        return NextResponse.json({
          message: 'Event type does not match trigger configuration. Ignoring.',
        })
      }
    }

    return true
  },
}

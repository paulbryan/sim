import crypto from 'crypto'
import { createLogger } from '@sim/logger'
import { NextResponse } from 'next/server'
import { safeCompare } from '@/lib/core/security/encryption'
import type {
  AuthContext,
  EventMatchContext,
  FormatInputContext,
  FormatInputResult,
  WebhookProviderHandler,
} from '@/lib/webhooks/providers/types'

const logger = createLogger('WebhookProvider:Notion')

/**
 * Validates a Notion webhook signature using HMAC SHA-256.
 * Notion sends X-Notion-Signature as "sha256=<hex>".
 */
function validateNotionSignature(secret: string, signature: string, body: string): boolean {
  try {
    if (!secret || !signature || !body) {
      logger.warn('Notion signature validation missing required fields', {
        hasSecret: !!secret,
        hasSignature: !!signature,
        hasBody: !!body,
      })
      return false
    }

    const providedHash = signature.startsWith('sha256=') ? signature.slice(7) : signature
    const computedHash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')

    logger.debug('Notion signature comparison', {
      computedSignature: `${computedHash.substring(0, 10)}...`,
      providedSignature: `${providedHash.substring(0, 10)}...`,
      computedLength: computedHash.length,
      providedLength: providedHash.length,
      match: computedHash === providedHash,
    })

    return safeCompare(computedHash, providedHash)
  } catch (error) {
    logger.error('Error validating Notion signature:', error)
    return false
  }
}

export const notionHandler: WebhookProviderHandler = {
  verifyAuth({ request, rawBody, requestId, providerConfig }: AuthContext) {
    const secret = providerConfig.webhookSecret as string | undefined
    if (!secret) {
      return null
    }

    const signature = request.headers.get('X-Notion-Signature')
    if (!signature) {
      logger.warn(`[${requestId}] Notion webhook missing signature header`)
      return new NextResponse('Unauthorized - Missing Notion signature', { status: 401 })
    }

    if (!validateNotionSignature(secret, signature, rawBody)) {
      logger.warn(`[${requestId}] Notion signature verification failed`, {
        signatureLength: signature.length,
        secretLength: secret.length,
      })
      return new NextResponse('Unauthorized - Invalid Notion signature', { status: 401 })
    }

    return null
  },

  async formatInput({ body }: FormatInputContext): Promise<FormatInputResult> {
    const b = body as Record<string, unknown>
    return {
      input: {
        id: b.id,
        type: b.type,
        timestamp: b.timestamp,
        workspace_id: b.workspace_id,
        workspace_name: b.workspace_name,
        subscription_id: b.subscription_id,
        integration_id: b.integration_id,
        attempt_number: b.attempt_number,
        authors: b.authors || [],
        entity: b.entity || {},
        data: b.data || {},
      },
    }
  },

  async matchEvent({ webhook, workflow, body, requestId, providerConfig }: EventMatchContext) {
    const triggerId = providerConfig.triggerId as string | undefined
    const obj = body as Record<string, unknown>

    if (triggerId && triggerId !== 'notion_webhook') {
      const { isNotionPayloadMatch } = await import('@/triggers/notion/utils')
      if (!isNotionPayloadMatch(triggerId, obj)) {
        const eventType = obj.type as string | undefined
        logger.debug(
          `[${requestId}] Notion event mismatch for trigger ${triggerId}. Event: ${eventType}. Skipping execution.`,
          {
            webhookId: webhook.id,
            workflowId: workflow.id,
            triggerId,
            receivedEvent: eventType,
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

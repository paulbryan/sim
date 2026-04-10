import { createLogger } from '@sim/logger'
import { getBYOKKey } from '@/lib/api-key/byok'
import { getHostedKeyRateLimiter } from '@/lib/core/rate-limiter/hosted-key'
import type { CustomPricingResult, HostingConfig, HostingPricing } from '@/tools/types'

const logger = createLogger('HostedKey')

/** Re-export so non-tool callers can stay out of `@/tools/types`. */
export type { CustomPricingResult, HostingConfig, HostingPricing } from '@/tools/types'

export interface AcquireHostedKeyResult {
  apiKey: string
  /** True if the key came from a workspace BYOK entry; false if from the platform pool */
  isBYOK: boolean
  /** Env var name the platform key came from (only when !isBYOK) */
  envVarName?: string
  /** Index of the key in the rotation pool (only when !isBYOK) */
  keyIndex?: number
}

/**
 * Acquire an API key for a hosted resource (tool or LLM provider).
 *
 * 1. Tries the workspace BYOK key first — if present, returns it without billing.
 * 2. Falls back to the platform's rate-limited key pool, distributed round-robin.
 *
 * Throws an error with `status: 429` and `retryAfterMs` when the workspace is
 * rate limited, or `status: 503` when no platform keys are configured.
 *
 * @param hosting - Hosting config describing the env prefix, BYOK provider, rate limit
 * @param workspaceId - Billing actor for rate limiting
 * @param resourceId - Identifier used in error/log messages and as the rate-limiter
 *   provider key when `hosting.byokProviderId` is not set
 */
export async function acquireHostedKey(
  hosting: HostingConfig,
  workspaceId: string,
  resourceId: string
): Promise<AcquireHostedKeyResult> {
  if (hosting.byokProviderId) {
    try {
      const byokResult = await getBYOKKey(workspaceId, hosting.byokProviderId)
      if (byokResult) {
        logger.info(`Using BYOK key for ${resourceId}`)
        return { apiKey: byokResult.apiKey, isBYOK: true }
      }
    } catch (error) {
      logger.error(`Failed to get BYOK key for ${resourceId}:`, error)
    }
  }

  const rateLimiter = getHostedKeyRateLimiter()
  const acquireResult = await rateLimiter.acquireKey(
    hosting.byokProviderId ?? resourceId,
    hosting.envKeyPrefix,
    hosting.rateLimit,
    workspaceId
  )

  if (acquireResult.success && acquireResult.key) {
    return {
      apiKey: acquireResult.key,
      isBYOK: false,
      envVarName: acquireResult.envVarName,
      keyIndex: acquireResult.keyIndex,
    }
  }

  if (acquireResult.billingActorRateLimited) {
    const error = new Error(
      acquireResult.error || `Rate limit exceeded for ${resourceId}`
    ) as Error & { status: number; retryAfterMs?: number }
    error.status = 429
    error.retryAfterMs = acquireResult.retryAfterMs
    throw error
  }

  const error = new Error(
    acquireResult.error || `No hosted keys configured for ${resourceId}`
  ) as Error & { status: number }
  error.status = 503
  throw error
}

/**
 * Resolve a {@link HostingPricing} to a flat `{ cost, metadata? }`.
 *
 * Mirrors the previous `calculateToolCost()` in `tools/index.ts` so the same
 * logic powers both tool cost handling and (after the unification) LLM
 * provider cost handling.
 */
export function calculateHostedCost<P>(
  pricing: HostingPricing<P>,
  params: P,
  response: Record<string, unknown>
): CustomPricingResult {
  if (pricing.type === 'per_request') {
    return { cost: pricing.cost }
  }
  const result = pricing.getCost(params, response)
  return typeof result === 'number' ? { cost: result } : result
}

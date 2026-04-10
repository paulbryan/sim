import { getCostMultiplier } from '@/lib/core/config/feature-flags'
import { getEmbeddingModelPricing, getModelPricing } from '@/providers/models'
import type { ModelPricing } from '@/providers/types'
import type { CustomPricing } from '@/tools/types'

/**
 * This module is intentionally a leaf — it imports `getEmbeddingModelPricing`
 * and `getModelPricing` from `@/providers/models` but only invokes them inside
 * a closure, never at top level. That keeps the import safe inside the
 * `models.ts → llm-token-pricing.ts → models.ts` cycle, because all the
 * back-references resolve lazily by the time `getCost` actually runs.
 */

const DEFAULT_PRICING: ModelPricing = {
  input: 1.0,
  cachedInput: 0.5,
  output: 5.0,
  updatedAt: '2025-03-21',
}

interface LlmCostResult {
  input: number
  output: number
  total: number
  pricing: ModelPricing
}

/**
 * Calculates token-based cost for an LLM model. Mirrors `calculateCost` in
 * `@/providers/utils` but lives in this leaf file so `models.ts` can wire up
 * `hosting.pricing` without dragging `utils.ts`'s top-level dependencies into
 * a circular import.
 */
function calculateLlmCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  useCachedInput: boolean,
  inputMultiplier: number,
  outputMultiplier: number
): LlmCostResult {
  let pricing = getEmbeddingModelPricing(model)
  if (!pricing) pricing = getModelPricing(model)
  if (!pricing) {
    return { input: 0, output: 0, total: 0, pricing: DEFAULT_PRICING }
  }

  const inputCost =
    promptTokens *
    (useCachedInput && pricing.cachedInput
      ? pricing.cachedInput / 1_000_000
      : pricing.input / 1_000_000)
  const outputCost = completionTokens * (pricing.output / 1_000_000)
  const finalInputCost = inputCost * inputMultiplier
  const finalOutputCost = outputCost * outputMultiplier
  const finalTotalCost = finalInputCost + finalOutputCost

  return {
    input: Number.parseFloat(finalInputCost.toFixed(8)),
    output: Number.parseFloat(finalOutputCost.toFixed(8)),
    total: Number.parseFloat(finalTotalCost.toFixed(8)),
    pricing,
  }
}

/**
 * Build a token-based pricing entry for an LLM provider's hosting config.
 *
 * The returned `CustomPricing` reads `model` and `tokens` off the provider
 * response, runs them through {@link calculateLlmCost}, and packs the
 * structured breakdown into `metadata`. `providers/index.ts` reads it back
 * out of `metadata` to populate `response.cost`.
 */
export function buildLlmTokenPricing(): CustomPricing {
  return {
    type: 'custom',
    getCost: (params, response) => {
      const r = response as { model?: string; tokens?: { input?: number; output?: number } }
      const p = params as { context?: unknown[] }
      const useCachedInput = Array.isArray(p.context) && p.context.length > 0
      const multiplier = getCostMultiplier()
      const result = calculateLlmCost(
        r.model ?? '',
        r.tokens?.input ?? 0,
        r.tokens?.output ?? 0,
        useCachedInput,
        multiplier,
        multiplier
      )
      return {
        cost: result.total,
        metadata: {
          input: result.input,
          output: result.output,
          pricing: result.pricing,
        },
      }
    },
  }
}

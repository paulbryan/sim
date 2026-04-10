import { createLogger } from '@sim/logger'
import { getApiKeyWithBYOK } from '@/lib/api-key/byok'
import { calculateHostedCost } from '@/lib/api-key/hosted-key'
import type { StreamingExecution } from '@/executor/types'
import { PROVIDER_DEFINITIONS } from '@/providers/models'
import { getProviderExecutor } from '@/providers/registry'
import type { ModelPricing, ProviderId, ProviderRequest, ProviderResponse } from '@/providers/types'
import {
  generateStructuredOutputInstructions,
  sumToolCosts,
  supportsReasoningEffort,
  supportsTemperature,
  supportsThinking,
  supportsVerbosity,
} from '@/providers/utils'

const ZERO_PRICING: ModelPricing = {
  input: 0,
  output: 0,
  updatedAt: new Date(0).toISOString(),
}

const logger = createLogger('Providers')

/**
 * Maximum number of iterations for tool call loops to prevent infinite loops.
 * Used across all providers that support tool/function calling.
 */
export const MAX_TOOL_ITERATIONS = 20

function sanitizeRequest(request: ProviderRequest): ProviderRequest {
  const sanitizedRequest = { ...request }
  const model = sanitizedRequest.model

  if (model && !supportsTemperature(model)) {
    sanitizedRequest.temperature = undefined
  }

  if (model && !supportsReasoningEffort(model)) {
    sanitizedRequest.reasoningEffort = undefined
  }

  if (model && !supportsVerbosity(model)) {
    sanitizedRequest.verbosity = undefined
  }

  if (model && !supportsThinking(model)) {
    sanitizedRequest.thinkingLevel = undefined
  }

  return sanitizedRequest
}

function isStreamingExecution(response: any): response is StreamingExecution {
  return response && typeof response === 'object' && 'stream' in response && 'execution' in response
}

function isReadableStream(response: any): response is ReadableStream {
  return response instanceof ReadableStream
}

export async function executeProviderRequest(
  providerId: string,
  request: ProviderRequest
): Promise<ProviderResponse | ReadableStream | StreamingExecution> {
  const provider = await getProviderExecutor(providerId as ProviderId)
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`)
  }

  if (!provider.executeRequest) {
    throw new Error(`Provider ${providerId} does not implement executeRequest`)
  }

  const resolvedRequest = sanitizeRequest(request) as ProviderRequest & Record<string, unknown>
  let isBYOK = false

  if (request.workspaceId) {
    try {
      const result = await getApiKeyWithBYOK(
        providerId,
        request.model,
        request.workspaceId,
        request.apiKey
      )
      const apiKeyField = PROVIDER_DEFINITIONS[providerId]?.hosting?.apiKeyParam ?? 'apiKey'
      resolvedRequest[apiKeyField] = result.apiKey
      isBYOK = result.isBYOK
    } catch (error) {
      logger.error('Failed to resolve API key:', {
        provider: providerId,
        model: request.model,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  resolvedRequest.isBYOK = isBYOK
  const sanitizedRequest = resolvedRequest

  if (sanitizedRequest.responseFormat) {
    if (
      typeof sanitizedRequest.responseFormat === 'string' &&
      sanitizedRequest.responseFormat === ''
    ) {
      logger.info('Empty response format provided, ignoring it')
      sanitizedRequest.responseFormat = undefined
    } else {
      const structuredOutputInstructions = generateStructuredOutputInstructions(
        sanitizedRequest.responseFormat
      )

      if (structuredOutputInstructions.trim()) {
        const originalPrompt = sanitizedRequest.systemPrompt || ''
        sanitizedRequest.systemPrompt =
          `${originalPrompt}\n\n${structuredOutputInstructions}`.trim()

        logger.info('Added structured output instructions to system prompt')
      }
    }
  }

  const response = await provider.executeRequest(sanitizedRequest)

  if (isStreamingExecution(response)) {
    logger.info('Provider returned StreamingExecution')
    return response
  }

  if (isReadableStream(response)) {
    logger.info('Provider returned ReadableStream')
    return response
  }

  if (response.tokens) {
    const hostingPricing = PROVIDER_DEFINITIONS[providerId]?.hosting?.pricing
    if (hostingPricing && !isBYOK) {
      const result = calculateHostedCost(
        hostingPricing,
        sanitizedRequest as unknown as Record<string, unknown>,
        response as unknown as Record<string, unknown>
      )
      const meta = (result.metadata ?? {}) as {
        input?: number
        output?: number
        pricing?: ModelPricing
      }
      response.cost = {
        input: meta.input ?? 0,
        output: meta.output ?? 0,
        total: result.cost,
        pricing: meta.pricing ?? ZERO_PRICING,
      }
    } else {
      response.cost = {
        input: 0,
        output: 0,
        total: 0,
        pricing: { ...ZERO_PRICING, updatedAt: new Date().toISOString() },
      }
      if (isBYOK) {
        logger.debug(`Not billing model usage for ${response.model} - workspace BYOK key used`)
      } else {
        logger.debug(
          `Not billing model usage for ${response.model} - provider has no hosting.pricing or non-hosted model`
        )
      }
    }
  }

  const toolCost = sumToolCosts(response.toolResults)
  if (toolCost > 0 && response.cost) {
    response.cost.toolCost = toolCost
    response.cost.total += toolCost
  }

  return response
}

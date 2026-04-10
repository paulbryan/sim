import { db } from '@sim/db'
import { workspaceBYOKKeys } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import { acquireHostedKey } from '@/lib/api-key/hosted-key'
import { env } from '@/lib/core/config/env'
import { isHosted } from '@/lib/core/config/feature-flags'
import { decryptSecret } from '@/lib/core/security/encryption'
import { getWorkspaceById } from '@/lib/workspaces/permissions/utils'
import { getHostedModels, PROVIDER_DEFINITIONS } from '@/providers/models'
import { PROVIDER_PLACEHOLDER_KEY } from '@/providers/utils'
import { useProvidersStore } from '@/stores/providers/store'
import type { BYOKProviderId } from '@/tools/types'

const logger = createLogger('BYOKKeys')

export interface BYOKKeyResult {
  apiKey: string
  isBYOK: true
}

export async function getBYOKKey(
  workspaceId: string | undefined | null,
  providerId: BYOKProviderId
): Promise<BYOKKeyResult | null> {
  if (!workspaceId) {
    return null
  }

  try {
    const activeWorkspace = await getWorkspaceById(workspaceId)
    if (!activeWorkspace) {
      return null
    }

    const result = await db
      .select({ encryptedApiKey: workspaceBYOKKeys.encryptedApiKey })
      .from(workspaceBYOKKeys)
      .where(
        and(
          eq(workspaceBYOKKeys.workspaceId, workspaceId),
          eq(workspaceBYOKKeys.providerId, providerId)
        )
      )
      .limit(1)

    if (!result.length) {
      return null
    }

    const { decrypted } = await decryptSecret(result[0].encryptedApiKey)
    return { apiKey: decrypted, isBYOK: true }
  } catch (error) {
    logger.error('Failed to get BYOK key', { workspaceId, providerId, error })
    return null
  }
}

export async function getApiKeyWithBYOK(
  provider: string,
  model: string,
  workspaceId: string | undefined | null,
  userProvidedKey?: string
): Promise<{ apiKey: string; isBYOK: boolean }> {
  const isOllamaModel =
    provider === 'ollama' || useProvidersStore.getState().providers.ollama.models.includes(model)
  if (isOllamaModel) {
    return { apiKey: 'empty', isBYOK: false }
  }

  const isVllmModel =
    provider === 'vllm' || useProvidersStore.getState().providers.vllm.models.includes(model)
  if (isVllmModel) {
    return { apiKey: userProvidedKey || env.VLLM_API_KEY || 'empty', isBYOK: false }
  }

  const isFireworksModel =
    provider === 'fireworks' ||
    useProvidersStore.getState().providers.fireworks.models.includes(model)
  if (isFireworksModel) {
    if (workspaceId) {
      const byokResult = await getBYOKKey(workspaceId, 'fireworks')
      if (byokResult) {
        logger.info('Using BYOK key for Fireworks', { model, workspaceId })
        return byokResult
      }
    }
    if (userProvidedKey) {
      return { apiKey: userProvidedKey, isBYOK: false }
    }
    if (env.FIREWORKS_API_KEY) {
      return { apiKey: env.FIREWORKS_API_KEY, isBYOK: false }
    }
    throw new Error(`API key is required for Fireworks ${model}`)
  }

  const isBedrockModel = provider === 'bedrock' || model.startsWith('bedrock/')
  if (isBedrockModel) {
    return { apiKey: PROVIDER_PLACEHOLDER_KEY, isBYOK: false }
  }

  if (provider === 'azure-openai') {
    return { apiKey: userProvidedKey || env.AZURE_OPENAI_API_KEY || '', isBYOK: false }
  }

  if (provider === 'azure-anthropic') {
    return { apiKey: userProvidedKey || env.AZURE_ANTHROPIC_API_KEY || '', isBYOK: false }
  }

  const hosting = PROVIDER_DEFINITIONS[provider]?.hosting

  if (isHosted && workspaceId && hosting) {
    const hostedModels = getHostedModels()
    const isModelHosted = hostedModels.some((m) => m.toLowerCase() === model.toLowerCase())

    logger.debug('BYOK check', { provider, model, workspaceId, isHosted, isModelHosted })

    if (isModelHosted) {
      try {
        const result = await acquireHostedKey(hosting, workspaceId, `${provider} ${model}`)
        return { apiKey: result.apiKey, isBYOK: result.isBYOK }
      } catch (error) {
        const status = (error as { status?: number }).status
        // Fall back to user-provided key only when no platform keys are configured.
        // Rate-limit (429) errors must surface so the workspace gets the right signal.
        if (status === 503 && userProvidedKey) {
          return { apiKey: userProvidedKey, isBYOK: false }
        }
        throw error
      }
    }
  }

  if (!userProvidedKey) {
    logger.debug('BYOK not applicable, no user key provided', {
      provider,
      model,
      workspaceId,
      isHosted,
    })
    throw new Error(`API key is required for ${provider} ${model}`)
  }

  return { apiKey: userProvidedKey, isBYOK: false }
}

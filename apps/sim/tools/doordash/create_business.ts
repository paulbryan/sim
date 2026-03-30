import type { DoordashBusinessResponse, DoordashCreateBusinessParams } from '@/tools/doordash/types'
import type { ToolConfig } from '@/tools/types'

export const createBusinessTool: ToolConfig<DoordashCreateBusinessParams, DoordashBusinessResponse> = {
  id: 'doordash_create_business',
  name: 'DoorDash Create Business',
  description: 'Creates a new business entity for organizing delivery locations.',
  version: '1.0.0',

  params: {
    developerId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'DoorDash Developer ID',
    },
    keyId: { type: 'string', required: true, visibility: 'user-only', description: 'DoorDash Key ID' },
    signingSecret: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'DoorDash Signing Secret',
    },
    externalBusinessId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unique business identifier',
    },
    name: { type: 'string', required: true, visibility: 'user-or-llm', description: 'Business name' },
    description: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Business description',
    },
  },

  request: {
    url: '/api/tools/doordash',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      operation: 'create_business',
      developerId: params.developerId,
      keyId: params.keyId,
      signingSecret: params.signingSecret,
      externalBusinessId: params.externalBusinessId,
      name: params.name,
      description: params.description,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    if (!data.success) {
      return { success: false, output: { error: data.error ?? 'Failed to create business' } }
    }
    return {
      success: true,
      output: {
        externalBusinessId: data.output.externalBusinessId ?? '',
        name: data.output.name ?? '',
        description: data.output.description ?? null,
        activationStatus: data.output.activationStatus ?? null,
      },
    }
  },

  outputs: {
    externalBusinessId: { type: 'string', description: 'Business ID' },
    name: { type: 'string', description: 'Business name' },
    description: { type: 'string', description: 'Business description', optional: true },
    activationStatus: { type: 'string', description: 'Activation status', optional: true },
  },
}

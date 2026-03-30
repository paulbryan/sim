import type { DoordashGetStoreParams, DoordashStoreResponse } from '@/tools/doordash/types'
import type { ToolConfig } from '@/tools/types'

export const getStoreTool: ToolConfig<DoordashGetStoreParams, DoordashStoreResponse> = {
  id: 'doordash_get_store',
  name: 'DoorDash Get Store',
  description: 'Retrieves details of a specific store.',
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
      description: 'Parent business ID',
    },
    externalStoreId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Store ID to retrieve',
    },
  },

  request: {
    url: '/api/tools/doordash',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      operation: 'get_store',
      developerId: params.developerId,
      keyId: params.keyId,
      signingSecret: params.signingSecret,
      externalBusinessId: params.externalBusinessId,
      externalStoreId: params.externalStoreId,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    if (!data.success) {
      return { success: false, output: { error: data.error ?? 'Failed to get store' } }
    }
    return {
      success: true,
      output: {
        externalStoreId: data.output.externalStoreId ?? '',
        name: data.output.name ?? '',
        phoneNumber: data.output.phoneNumber ?? null,
        address: data.output.address ?? null,
      },
    }
  },

  outputs: {
    externalStoreId: { type: 'string', description: 'Store ID' },
    name: { type: 'string', description: 'Store name' },
    phoneNumber: { type: 'string', description: 'Store phone number' },
    address: { type: 'string', description: 'Store address' },
  },
}

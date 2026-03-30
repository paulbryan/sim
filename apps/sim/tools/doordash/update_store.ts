import type { DoordashStoreResponse, DoordashUpdateStoreParams } from '@/tools/doordash/types'
import type { ToolConfig } from '@/tools/types'

export const updateStoreTool: ToolConfig<DoordashUpdateStoreParams, DoordashStoreResponse> = {
  id: 'doordash_update_store',
  name: 'DoorDash Update Store',
  description: 'Updates a store location name, phone number, or address.',
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
      description: 'Store ID to update',
    },
    name: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Updated store name',
    },
    phoneNumber: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Updated phone number',
    },
    address: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Updated address',
    },
  },

  request: {
    url: '/api/tools/doordash',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      operation: 'update_store',
      developerId: params.developerId,
      keyId: params.keyId,
      signingSecret: params.signingSecret,
      externalBusinessId: params.externalBusinessId,
      externalStoreId: params.externalStoreId,
      name: params.name,
      phoneNumber: params.phoneNumber,
      address: params.address,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    if (!data.success) {
      return { success: false, output: { error: data.error ?? 'Failed to update store' } }
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

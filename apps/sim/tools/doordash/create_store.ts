import type { DoordashCreateStoreParams, DoordashStoreResponse } from '@/tools/doordash/types'
import type { ToolConfig } from '@/tools/types'

export const createStoreTool: ToolConfig<DoordashCreateStoreParams, DoordashStoreResponse> = {
  id: 'doordash_create_store',
  name: 'DoorDash Create Store',
  description: 'Creates a store location under a business for delivery pickup.',
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
      description: 'Unique store identifier',
    },
    name: { type: 'string', required: true, visibility: 'user-or-llm', description: 'Store name' },
    phoneNumber: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Store phone number',
    },
    address: { type: 'string', required: true, visibility: 'user-or-llm', description: 'Store address' },
  },

  request: {
    url: '/api/tools/doordash',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      operation: 'create_store',
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
      return { success: false, output: { error: data.error ?? 'Failed to create store' } }
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

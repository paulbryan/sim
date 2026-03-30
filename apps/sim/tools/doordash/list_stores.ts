import type { DoordashListStoresParams, DoordashStoreListResponse } from '@/tools/doordash/types'
import type { ToolConfig } from '@/tools/types'

export const listStoresTool: ToolConfig<DoordashListStoresParams, DoordashStoreListResponse> = {
  id: 'doordash_list_stores',
  name: 'DoorDash List Stores',
  description: 'Lists all stores under a business.',
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
      description: 'Business ID to list stores for',
    },
  },

  request: {
    url: '/api/tools/doordash',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      operation: 'list_stores',
      developerId: params.developerId,
      keyId: params.keyId,
      signingSecret: params.signingSecret,
      externalBusinessId: params.externalBusinessId,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    if (!data.success) {
      return { success: false, output: { error: data.error ?? 'Failed to list stores' } }
    }
    return { success: true, output: { stores: data.output.stores ?? [] } }
  },

  outputs: {
    stores: {
      type: 'array',
      description: 'List of stores',
      items: {
        type: 'object',
        properties: {
          externalStoreId: { type: 'string', description: 'Store ID' },
          name: { type: 'string', description: 'Store name' },
          phoneNumber: { type: 'string', description: 'Store phone number' },
          address: { type: 'string', description: 'Store address' },
        },
      },
    },
  },
}

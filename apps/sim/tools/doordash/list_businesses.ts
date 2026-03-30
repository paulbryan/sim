import type { DoordashBusinessListResponse, DoordashListBusinessesParams } from '@/tools/doordash/types'
import type { ToolConfig } from '@/tools/types'

export const listBusinessesTool: ToolConfig<
  DoordashListBusinessesParams,
  DoordashBusinessListResponse
> = {
  id: 'doordash_list_businesses',
  name: 'DoorDash List Businesses',
  description: 'Lists all businesses owned by the developer.',
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
  },

  request: {
    url: '/api/tools/doordash',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      operation: 'list_businesses',
      developerId: params.developerId,
      keyId: params.keyId,
      signingSecret: params.signingSecret,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    if (!data.success) {
      return { success: false, output: { error: data.error ?? 'Failed to list businesses' } }
    }
    return { success: true, output: { businesses: data.output.businesses ?? [] } }
  },

  outputs: {
    businesses: {
      type: 'array',
      description: 'List of businesses',
      items: {
        type: 'object',
        properties: {
          externalBusinessId: { type: 'string', description: 'Business ID' },
          name: { type: 'string', description: 'Business name' },
          description: { type: 'string', description: 'Business description' },
          activationStatus: { type: 'string', description: 'Activation status' },
        },
      },
    },
  },
}

import type {
  DoordashCancelDeliveryParams,
  DoordashCancelResponse,
} from '@/tools/doordash/types'
import type { ToolConfig } from '@/tools/types'

export const cancelDeliveryTool: ToolConfig<
  DoordashCancelDeliveryParams,
  DoordashCancelResponse
> = {
  id: 'doordash_cancel_delivery',
  name: 'DoorDash Cancel Delivery',
  description:
    'Cancels a delivery. Cannot be used after a Dasher has been assigned to the delivery.',
  version: '1.0.0',

  params: {
    developerId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'DoorDash Developer ID',
    },
    keyId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'DoorDash Key ID',
    },
    signingSecret: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'DoorDash Signing Secret',
    },
    externalDeliveryId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'External delivery ID to cancel',
    },
  },

  request: {
    url: '/api/tools/doordash',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      operation: 'cancel_delivery',
      developerId: params.developerId,
      keyId: params.keyId,
      signingSecret: params.signingSecret,
      externalDeliveryId: params.externalDeliveryId,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!data.success) {
      return { success: false, output: { error: data.error ?? 'Failed to cancel delivery' } }
    }

    return {
      success: true,
      output: {
        externalDeliveryId: data.output.externalDeliveryId ?? '',
        deliveryStatus: data.output.deliveryStatus ?? '',
      },
    }
  },

  outputs: {
    externalDeliveryId: { type: 'string', description: 'External delivery ID' },
    deliveryStatus: { type: 'string', description: 'Delivery status (cancelled)' },
  },
}

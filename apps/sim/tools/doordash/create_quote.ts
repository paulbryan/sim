import type { DoordashCreateQuoteParams, DoordashQuoteResponse } from '@/tools/doordash/types'
import type { ToolConfig } from '@/tools/types'

export const createQuoteTool: ToolConfig<DoordashCreateQuoteParams, DoordashQuoteResponse> = {
  id: 'doordash_create_quote',
  name: 'DoorDash Create Quote',
  description:
    'Creates a delivery quote to validate coverage, pricing, and estimated delivery times.',
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
      description: 'Unique delivery identifier',
    },
    pickupAddress: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Pickup address (e.g., "901 Market Street 6th Floor San Francisco, CA 94103")',
    },
    pickupPhoneNumber: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Pickup phone number (e.g., "+16505555555")',
    },
    pickupBusinessName: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Pickup business name',
    },
    dropoffAddress: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Dropoff address',
    },
    dropoffPhoneNumber: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Dropoff phone number',
    },
    dropoffBusinessName: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Dropoff contact or business name',
    },
    orderValue: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Order value in cents (e.g., "1999" for $19.99)',
    },
    pickupInstructions: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Instructions for pickup',
    },
    dropoffInstructions: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Instructions for dropoff',
    },
    tip: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Tip amount in cents',
    },
    dropoffContactSendNotifications: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Send SMS notifications to recipient (true/false)',
    },
    actionIfUndeliverable: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Action if undeliverable (e.g., "return_to_pickup")',
    },
    contactlessDropoff: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Contactless doorstep delivery with photo verification (true/false)',
    },
    dropoffRequiresSignature: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Require signature at dropoff (true/false)',
    },
    dropoffContactGivenName: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Recipient first name',
    },
    dropoffContactFamilyName: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Recipient last name',
    },
    pickupTime: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Scheduled pickup time (ISO 8601, mutually exclusive with dropoffTime)',
    },
    dropoffTime: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Scheduled dropoff time (ISO 8601, mutually exclusive with pickupTime)',
    },
  },

  request: {
    url: '/api/tools/doordash',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      operation: 'create_quote',
      developerId: params.developerId,
      keyId: params.keyId,
      signingSecret: params.signingSecret,
      externalDeliveryId: params.externalDeliveryId,
      pickupAddress: params.pickupAddress,
      pickupPhoneNumber: params.pickupPhoneNumber,
      pickupBusinessName: params.pickupBusinessName,
      dropoffAddress: params.dropoffAddress,
      dropoffPhoneNumber: params.dropoffPhoneNumber,
      dropoffBusinessName: params.dropoffBusinessName,
      orderValue: params.orderValue,
      pickupInstructions: params.pickupInstructions,
      dropoffInstructions: params.dropoffInstructions,
      tip: params.tip,
      dropoffContactSendNotifications: params.dropoffContactSendNotifications,
      actionIfUndeliverable: params.actionIfUndeliverable,
      contactlessDropoff: params.contactlessDropoff,
      dropoffRequiresSignature: params.dropoffRequiresSignature,
      dropoffContactGivenName: params.dropoffContactGivenName,
      dropoffContactFamilyName: params.dropoffContactFamilyName,
      pickupTime: params.pickupTime,
      dropoffTime: params.dropoffTime,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!data.success) {
      return { success: false, output: { error: data.error ?? 'Failed to create quote' } }
    }

    return {
      success: true,
      output: {
        externalDeliveryId: data.output.externalDeliveryId ?? '',
        deliveryStatus: data.output.deliveryStatus ?? '',
        fee: data.output.fee ?? null,
        currency: data.output.currency ?? null,
        pickupTimeEstimated: data.output.pickupTimeEstimated ?? null,
        dropoffTimeEstimated: data.output.dropoffTimeEstimated ?? null,
      },
    }
  },

  outputs: {
    externalDeliveryId: { type: 'string', description: 'External delivery ID' },
    deliveryStatus: { type: 'string', description: 'Delivery status' },
    fee: { type: 'number', description: 'Delivery fee in cents' },
    currency: { type: 'string', description: 'Fee currency code' },
    pickupTimeEstimated: { type: 'string', description: 'Estimated pickup time' },
    dropoffTimeEstimated: { type: 'string', description: 'Estimated dropoff time' },
  },
}

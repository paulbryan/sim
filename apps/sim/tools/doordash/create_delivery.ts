import type {
  DoordashCreateDeliveryParams,
  DoordashDeliveryResponse,
} from '@/tools/doordash/types'
import type { ToolConfig } from '@/tools/types'

export const createDeliveryTool: ToolConfig<
  DoordashCreateDeliveryParams,
  DoordashDeliveryResponse
> = {
  id: 'doordash_create_delivery',
  name: 'DoorDash Create Delivery',
  description: 'Creates a delivery directly without a prior quote. Skips price confirmation.',
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
      operation: 'create_delivery',
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
      return { success: false, output: { error: data.error ?? 'Failed to create delivery' } }
    }

    return {
      success: true,
      output: {
        externalDeliveryId: data.output.externalDeliveryId ?? '',
        deliveryStatus: data.output.deliveryStatus ?? '',
        fee: data.output.fee ?? null,
        tip: data.output.tip ?? null,
        orderValue: data.output.orderValue ?? null,
        currency: data.output.currency ?? null,
        trackingUrl: data.output.trackingUrl ?? null,
        supportReference: data.output.supportReference ?? null,
        dasherName: data.output.dasherName ?? null,
        dasherId: data.output.dasherId ?? null,
        contactlessDropoff: data.output.contactlessDropoff ?? null,
        dropoffVerificationImageUrl: data.output.dropoffVerificationImageUrl ?? null,
        cancellationReason: data.output.cancellationReason ?? null,
        pickupTimeEstimated: data.output.pickupTimeEstimated ?? null,
        pickupTimeActual: data.output.pickupTimeActual ?? null,
        dropoffTimeEstimated: data.output.dropoffTimeEstimated ?? null,
        dropoffTimeActual: data.output.dropoffTimeActual ?? null,
        pickupAddress: data.output.pickupAddress ?? null,
        dropoffAddress: data.output.dropoffAddress ?? null,
        updatedAt: data.output.updatedAt ?? null,
      },
    }
  },

  outputs: {
    externalDeliveryId: { type: 'string', description: 'External delivery ID' },
    deliveryStatus: { type: 'string', description: 'Delivery status' },
    fee: { type: 'number', description: 'Delivery fee in cents' },
    tip: { type: 'number', description: 'Tip amount in cents', optional: true },
    orderValue: { type: 'number', description: 'Order value in cents' },
    currency: { type: 'string', description: 'Fee currency code' },
    trackingUrl: { type: 'string', description: 'Delivery tracking URL' },
    supportReference: { type: 'string', description: 'Support reference ID' },
    dasherName: { type: 'string', description: 'Assigned Dasher name', optional: true },
    dasherId: { type: 'number', description: 'Assigned Dasher ID', optional: true },
    contactlessDropoff: { type: 'boolean', description: 'Whether contactless dropoff was used', optional: true },
    dropoffVerificationImageUrl: { type: 'string', description: 'Photo verification URL at dropoff', optional: true },
    cancellationReason: { type: 'string', description: 'Reason for cancellation', optional: true },
    pickupTimeEstimated: { type: 'string', description: 'Estimated pickup time' },
    pickupTimeActual: { type: 'string', description: 'Actual pickup time', optional: true },
    dropoffTimeEstimated: { type: 'string', description: 'Estimated dropoff time' },
    dropoffTimeActual: { type: 'string', description: 'Actual dropoff time', optional: true },
    pickupAddress: { type: 'string', description: 'Pickup address' },
    dropoffAddress: { type: 'string', description: 'Dropoff address' },
    updatedAt: { type: 'string', description: 'Last updated timestamp', optional: true },
  },
}

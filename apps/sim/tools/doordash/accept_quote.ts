import type { DoordashAcceptQuoteParams, DoordashDeliveryResponse } from '@/tools/doordash/types'
import type { ToolConfig } from '@/tools/types'

export const acceptQuoteTool: ToolConfig<DoordashAcceptQuoteParams, DoordashDeliveryResponse> = {
  id: 'doordash_accept_quote',
  name: 'DoorDash Accept Quote',
  description:
    'Accepts a delivery quote to formally create the delivery. Must be called within 5 minutes of creating the quote.',
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
      description: 'External delivery ID from the quote',
    },
    tip: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Tip amount in cents',
    },
    dropoffPhoneNumber: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Updated dropoff phone number',
    },
  },

  request: {
    url: '/api/tools/doordash',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      operation: 'accept_quote',
      developerId: params.developerId,
      keyId: params.keyId,
      signingSecret: params.signingSecret,
      externalDeliveryId: params.externalDeliveryId,
      tip: params.tip,
      dropoffPhoneNumber: params.dropoffPhoneNumber,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!data.success) {
      return { success: false, output: { error: data.error ?? 'Failed to accept quote' } }
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

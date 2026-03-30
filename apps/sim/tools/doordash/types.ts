import type { OutputProperty, ToolResponse } from '@/tools/types'

export interface DoordashBaseParams {
  developerId: string
  keyId: string
  signingSecret: string
}

export interface DoordashCreateQuoteParams extends DoordashBaseParams {
  externalDeliveryId: string
  pickupAddress: string
  pickupPhoneNumber: string
  pickupBusinessName: string
  dropoffAddress: string
  dropoffPhoneNumber: string
  dropoffBusinessName: string
  orderValue: string
  pickupInstructions?: string
  dropoffInstructions?: string
  tip?: string
  dropoffContactSendNotifications?: string
  actionIfUndeliverable?: string
  contactlessDropoff?: string
  dropoffRequiresSignature?: string
  dropoffContactGivenName?: string
  dropoffContactFamilyName?: string
  pickupTime?: string
  dropoffTime?: string
}

export interface DoordashAcceptQuoteParams extends DoordashBaseParams {
  externalDeliveryId: string
  tip?: string
  dropoffPhoneNumber?: string
}

export interface DoordashCreateDeliveryParams extends DoordashBaseParams {
  externalDeliveryId: string
  pickupAddress: string
  pickupPhoneNumber: string
  pickupBusinessName: string
  dropoffAddress: string
  dropoffPhoneNumber: string
  dropoffBusinessName: string
  orderValue: string
  pickupInstructions?: string
  dropoffInstructions?: string
  tip?: string
  dropoffContactSendNotifications?: string
  actionIfUndeliverable?: string
  contactlessDropoff?: string
  dropoffRequiresSignature?: string
  dropoffContactGivenName?: string
  dropoffContactFamilyName?: string
  pickupTime?: string
  dropoffTime?: string
}

export interface DoordashGetDeliveryParams extends DoordashBaseParams {
  externalDeliveryId: string
}

export interface DoordashUpdateDeliveryParams extends DoordashBaseParams {
  externalDeliveryId: string
  tip?: string
  dropoffPhoneNumber?: string
  dropoffInstructions?: string
}

export interface DoordashCancelDeliveryParams extends DoordashBaseParams {
  externalDeliveryId: string
}

export interface DoordashQuoteResponse extends ToolResponse {
  output: {
    externalDeliveryId: string
    deliveryStatus: string
    fee: number | null
    currency: string | null
    pickupTimeEstimated: string | null
    dropoffTimeEstimated: string | null
  }
}

export interface DoordashDeliveryResponse extends ToolResponse {
  output: {
    externalDeliveryId: string
    deliveryStatus: string
    fee: number | null
    tip: number | null
    orderValue: number | null
    currency: string | null
    trackingUrl: string | null
    supportReference: string | null
    dasherName: string | null
    dasherId: number | null
    contactlessDropoff: boolean | null
    dropoffVerificationImageUrl: string | null
    cancellationReason: string | null
    pickupTimeEstimated: string | null
    pickupTimeActual: string | null
    dropoffTimeEstimated: string | null
    dropoffTimeActual: string | null
    pickupAddress: string | null
    dropoffAddress: string | null
    updatedAt: string | null
  }
}

export interface DoordashCancelResponse extends ToolResponse {
  output: {
    externalDeliveryId: string
    deliveryStatus: string
  }
}

export const QUOTE_OUTPUT_PROPERTIES = {
  externalDeliveryId: { type: 'string', description: 'External delivery ID' },
  deliveryStatus: { type: 'string', description: 'Delivery status (e.g., quote)' },
  fee: { type: 'number', description: 'Delivery fee in cents' },
  currency: { type: 'string', description: 'Fee currency code (e.g., USD)' },
  pickupTimeEstimated: { type: 'string', description: 'Estimated pickup time (ISO 8601)' },
  dropoffTimeEstimated: { type: 'string', description: 'Estimated dropoff time (ISO 8601)' },
} as const satisfies Record<string, OutputProperty>

export const DELIVERY_OUTPUT_PROPERTIES = {
  externalDeliveryId: { type: 'string', description: 'External delivery ID' },
  deliveryStatus: {
    type: 'string',
    description:
      'Delivery status (quote, created, scheduled, assigned, picked_up, delivered, cancelled, returned)',
  },
  fee: { type: 'number', description: 'Delivery fee in cents' },
  tip: { type: 'number', description: 'Tip amount in cents', optional: true },
  orderValue: { type: 'number', description: 'Order value in cents' },
  currency: { type: 'string', description: 'Fee currency code (e.g., USD)' },
  trackingUrl: { type: 'string', description: 'Delivery tracking URL' },
  supportReference: { type: 'string', description: 'Support reference ID' },
  dasherName: { type: 'string', description: 'Assigned Dasher name', optional: true },
  dasherId: { type: 'number', description: 'Assigned Dasher ID', optional: true },
  contactlessDropoff: { type: 'boolean', description: 'Whether contactless dropoff was used', optional: true },
  dropoffVerificationImageUrl: { type: 'string', description: 'Photo verification URL at dropoff', optional: true },
  cancellationReason: { type: 'string', description: 'Reason for cancellation', optional: true },
  pickupTimeEstimated: { type: 'string', description: 'Estimated pickup time (ISO 8601)' },
  pickupTimeActual: {
    type: 'string',
    description: 'Actual pickup time (ISO 8601)',
    optional: true,
  },
  dropoffTimeEstimated: { type: 'string', description: 'Estimated dropoff time (ISO 8601)' },
  dropoffTimeActual: {
    type: 'string',
    description: 'Actual dropoff time (ISO 8601)',
    optional: true,
  },
  pickupAddress: { type: 'string', description: 'Pickup address' },
  dropoffAddress: { type: 'string', description: 'Dropoff address' },
  updatedAt: { type: 'string', description: 'Last updated timestamp', optional: true },
} as const satisfies Record<string, OutputProperty>

export interface DoordashCreateBusinessParams extends DoordashBaseParams {
  externalBusinessId: string
  name: string
  description?: string
}

export interface DoordashListBusinessesParams extends DoordashBaseParams {}

export interface DoordashUpdateBusinessParams extends DoordashBaseParams {
  externalBusinessId: string
  name?: string
  description?: string
}

export interface DoordashCreateStoreParams extends DoordashBaseParams {
  externalBusinessId: string
  externalStoreId: string
  name: string
  phoneNumber: string
  address: string
}

export interface DoordashListStoresParams extends DoordashBaseParams {
  externalBusinessId: string
}

export interface DoordashGetStoreParams extends DoordashBaseParams {
  externalBusinessId: string
  externalStoreId: string
}

export interface DoordashUpdateStoreParams extends DoordashBaseParams {
  externalBusinessId: string
  externalStoreId: string
  name?: string
  phoneNumber?: string
  address?: string
}

export interface DoordashBusinessResponse extends ToolResponse {
  output: {
    externalBusinessId: string
    name: string
    description: string | null
    activationStatus: string | null
  }
}

export interface DoordashBusinessListResponse extends ToolResponse {
  output: {
    businesses: Array<{
      externalBusinessId: string
      name: string
      description: string | null
      activationStatus: string | null
    }>
  }
}

export interface DoordashStoreResponse extends ToolResponse {
  output: {
    externalStoreId: string
    name: string
    phoneNumber: string | null
    address: string | null
  }
}

export interface DoordashStoreListResponse extends ToolResponse {
  output: {
    stores: Array<{
      externalStoreId: string
      name: string
      phoneNumber: string | null
      address: string | null
    }>
  }
}

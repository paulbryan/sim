import { DoordashIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode, IntegrationType } from '@/blocks/types'
import type { DoordashDeliveryResponse } from '@/tools/doordash/types'

export const DoordashBlock: BlockConfig<DoordashDeliveryResponse> = {
  type: 'doordash',
  name: 'DoorDash',
  description: 'Create and manage DoorDash Drive deliveries, businesses, and stores',
  longDescription:
    'Integrate DoorDash Drive into workflows. Create delivery quotes, accept quotes, create deliveries, track status, update details, cancel deliveries, and manage businesses and store locations.',
  docsLink: 'https://docs.sim.ai/tools/doordash',
  category: 'tools',
  integrationType: IntegrationType.Ecommerce,
  tags: ['automation'],
  bgColor: '#FF3008',
  icon: DoordashIcon,
  authMode: AuthMode.ApiKey,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Create Quote', id: 'create_quote' },
        { label: 'Accept Quote', id: 'accept_quote' },
        { label: 'Create Delivery', id: 'create_delivery' },
        { label: 'Get Delivery', id: 'get_delivery' },
        { label: 'Update Delivery', id: 'update_delivery' },
        { label: 'Cancel Delivery', id: 'cancel_delivery' },
        { label: 'Create Business', id: 'create_business' },
        { label: 'List Businesses', id: 'list_businesses' },
        { label: 'Update Business', id: 'update_business' },
        { label: 'Create Store', id: 'create_store' },
        { label: 'List Stores', id: 'list_stores' },
        { label: 'Get Store', id: 'get_store' },
        { label: 'Update Store', id: 'update_store' },
      ],
      value: () => 'create_quote',
    },

    // Credentials (common to all operations)
    {
      id: 'developerId',
      title: 'Developer ID',
      type: 'short-input',
      placeholder: 'Enter your DoorDash Developer ID',
      password: true,
      required: true,
    },
    {
      id: 'keyId',
      title: 'Key ID',
      type: 'short-input',
      placeholder: 'Enter your DoorDash Key ID',
      password: true,
      required: true,
    },
    {
      id: 'signingSecret',
      title: 'Signing Secret',
      type: 'short-input',
      placeholder: 'Enter your DoorDash Signing Secret',
      password: true,
      required: true,
    },

    // Delivery ID (delivery operations only)
    {
      id: 'externalDeliveryId',
      title: 'External Delivery ID',
      type: 'short-input',
      placeholder: 'Unique delivery identifier (e.g., D-12345)',
      required: {
        field: 'operation',
        value: [
          'create_quote',
          'accept_quote',
          'create_delivery',
          'get_delivery',
          'update_delivery',
          'cancel_delivery',
        ],
      },
      condition: {
        field: 'operation',
        value: [
          'create_quote',
          'accept_quote',
          'create_delivery',
          'get_delivery',
          'update_delivery',
          'cancel_delivery',
        ],
      },
    },

    // Pickup fields (create_quote and create_delivery)
    {
      id: 'pickupAddress',
      title: 'Pickup Address',
      type: 'short-input',
      placeholder: '901 Market Street, San Francisco, CA 94103',
      required: { field: 'operation', value: ['create_quote', 'create_delivery'] },
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },
    {
      id: 'pickupPhoneNumber',
      title: 'Pickup Phone',
      type: 'short-input',
      placeholder: '+16505555555',
      required: { field: 'operation', value: ['create_quote', 'create_delivery'] },
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },
    {
      id: 'pickupBusinessName',
      title: 'Pickup Business Name',
      type: 'short-input',
      placeholder: 'Business name at pickup',
      required: { field: 'operation', value: ['create_quote', 'create_delivery'] },
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },

    // Dropoff fields (create_quote and create_delivery)
    {
      id: 'dropoffAddress',
      title: 'Dropoff Address',
      type: 'short-input',
      placeholder: '123 Main Street, San Francisco, CA 94105',
      required: { field: 'operation', value: ['create_quote', 'create_delivery'] },
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },
    {
      id: 'dropoffPhoneNumber',
      title: 'Dropoff Phone',
      type: 'short-input',
      placeholder: '+16505555555',
      required: { field: 'operation', value: ['create_quote', 'create_delivery'] },
      condition: {
        field: 'operation',
        value: ['create_quote', 'create_delivery', 'accept_quote', 'update_delivery'],
      },
    },
    {
      id: 'dropoffBusinessName',
      title: 'Dropoff Contact Name',
      type: 'short-input',
      placeholder: 'Recipient name or business',
      required: { field: 'operation', value: ['create_quote', 'create_delivery'] },
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },

    // Order value (create_quote and create_delivery)
    {
      id: 'orderValue',
      title: 'Order Value (cents)',
      type: 'short-input',
      placeholder: '1999 (for $19.99)',
      required: { field: 'operation', value: ['create_quote', 'create_delivery'] },
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },

    // Recipient name fields (advanced, create_quote/create_delivery)
    {
      id: 'dropoffContactGivenName',
      title: 'Recipient First Name',
      type: 'short-input',
      placeholder: 'Customer first name',
      mode: 'advanced',
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },
    {
      id: 'dropoffContactFamilyName',
      title: 'Recipient Last Name',
      type: 'short-input',
      placeholder: 'Customer last name',
      mode: 'advanced',
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },

    // Optional delivery fields
    {
      id: 'pickupInstructions',
      title: 'Pickup Instructions',
      type: 'short-input',
      placeholder: 'Instructions for the Dasher at pickup',
      mode: 'advanced',
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },
    {
      id: 'dropoffInstructions',
      title: 'Dropoff Instructions',
      type: 'short-input',
      placeholder: 'Instructions for the Dasher at dropoff',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['create_quote', 'create_delivery', 'update_delivery'],
      },
    },
    {
      id: 'tip',
      title: 'Tip (cents)',
      type: 'short-input',
      placeholder: '500 (for $5.00)',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['create_quote', 'create_delivery', 'accept_quote', 'update_delivery'],
      },
    },
    {
      id: 'pickupTime',
      title: 'Scheduled Pickup Time',
      type: 'short-input',
      placeholder: 'ISO 8601 (e.g., 2025-01-15T14:00:00Z)',
      mode: 'advanced',
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
      wandConfig: {
        enabled: true,
        prompt: `Generate an ISO 8601 timestamp for the requested pickup time. Return ONLY the timestamp string - no explanations, no extra text.`,
        placeholder: 'Describe when to pick up (e.g., "in 2 hours", "tomorrow at 3pm")...',
        generationType: 'timestamp',
      },
    },
    {
      id: 'dropoffTime',
      title: 'Scheduled Dropoff Time',
      type: 'short-input',
      placeholder: 'ISO 8601 (e.g., 2025-01-15T15:00:00Z)',
      mode: 'advanced',
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
      wandConfig: {
        enabled: true,
        prompt: `Generate an ISO 8601 timestamp for the requested dropoff time. Return ONLY the timestamp string - no explanations, no extra text.`,
        placeholder: 'Describe when to deliver (e.g., "by 5pm", "in 3 hours")...',
        generationType: 'timestamp',
      },
    },
    {
      id: 'contactlessDropoff',
      title: 'Contactless Dropoff',
      type: 'dropdown',
      options: [
        { label: 'No', id: '' },
        { label: 'Yes', id: 'true' },
      ],
      value: () => '',
      mode: 'advanced',
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },
    {
      id: 'dropoffRequiresSignature',
      title: 'Require Signature',
      type: 'dropdown',
      options: [
        { label: 'No', id: '' },
        { label: 'Yes', id: 'true' },
      ],
      value: () => '',
      mode: 'advanced',
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },
    {
      id: 'dropoffContactSendNotifications',
      title: 'Send SMS Notifications',
      type: 'dropdown',
      options: [
        { label: 'Yes', id: 'true' },
        { label: 'No', id: 'false' },
      ],
      value: () => 'true',
      mode: 'advanced',
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },
    {
      id: 'actionIfUndeliverable',
      title: 'If Undeliverable',
      type: 'dropdown',
      options: [
        { label: 'Default', id: '' },
        { label: 'Return to Pickup', id: 'return_to_pickup' },
      ],
      value: () => '',
      mode: 'advanced',
      condition: { field: 'operation', value: ['create_quote', 'create_delivery'] },
    },

    // Business fields
    {
      id: 'externalBusinessId',
      title: 'Business ID',
      type: 'short-input',
      placeholder: 'Unique business identifier',
      required: {
        field: 'operation',
        value: [
          'create_business',
          'update_business',
          'create_store',
          'list_stores',
          'get_store',
          'update_store',
        ],
      },
      condition: {
        field: 'operation',
        value: [
          'create_business',
          'update_business',
          'create_store',
          'list_stores',
          'get_store',
          'update_store',
        ],
      },
    },
    {
      id: 'name',
      title: 'Name',
      type: 'short-input',
      placeholder: 'Business or store name',
      required: {
        field: 'operation',
        value: ['create_business', 'create_store'],
      },
      condition: {
        field: 'operation',
        value: ['create_business', 'update_business', 'create_store', 'update_store'],
      },
    },
    {
      id: 'description',
      title: 'Description',
      type: 'short-input',
      placeholder: 'Business description',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['create_business', 'update_business'],
      },
    },

    // Store fields
    {
      id: 'externalStoreId',
      title: 'Store ID',
      type: 'short-input',
      placeholder: 'Unique store identifier',
      required: {
        field: 'operation',
        value: ['create_store', 'get_store', 'update_store'],
      },
      condition: {
        field: 'operation',
        value: ['create_store', 'get_store', 'update_store'],
      },
    },
    {
      id: 'phoneNumber',
      title: 'Store Phone',
      type: 'short-input',
      placeholder: '+16505555555',
      required: { field: 'operation', value: 'create_store' },
      condition: {
        field: 'operation',
        value: ['create_store', 'update_store'],
      },
    },
    {
      id: 'address',
      title: 'Store Address',
      type: 'short-input',
      placeholder: '901 Market Street, San Francisco, CA 94103',
      required: { field: 'operation', value: 'create_store' },
      condition: {
        field: 'operation',
        value: ['create_store', 'update_store'],
      },
    },
  ],
  tools: {
    access: [
      'doordash_create_quote',
      'doordash_accept_quote',
      'doordash_create_delivery',
      'doordash_get_delivery',
      'doordash_update_delivery',
      'doordash_cancel_delivery',
      'doordash_create_business',
      'doordash_list_businesses',
      'doordash_update_business',
      'doordash_create_store',
      'doordash_list_stores',
      'doordash_get_store',
      'doordash_update_store',
    ],
    config: {
      tool: (params) => `doordash_${params.operation}`,
      params: (params) => {
        const result: Record<string, unknown> = {}
        if (params.orderValue) result.orderValue = String(params.orderValue)
        if (params.tip) result.tip = String(params.tip)
        if (params.actionIfUndeliverable === '') result.actionIfUndeliverable = undefined
        if (params.contactlessDropoff === '') result.contactlessDropoff = undefined
        if (params.dropoffRequiresSignature === '') result.dropoffRequiresSignature = undefined
        return result
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    developerId: { type: 'string', description: 'DoorDash Developer ID' },
    keyId: { type: 'string', description: 'DoorDash Key ID' },
    signingSecret: { type: 'string', description: 'DoorDash Signing Secret' },
    externalDeliveryId: { type: 'string', description: 'Unique delivery identifier' },
    pickupAddress: { type: 'string', description: 'Pickup address' },
    pickupPhoneNumber: { type: 'string', description: 'Pickup phone number' },
    pickupBusinessName: { type: 'string', description: 'Pickup business name' },
    dropoffAddress: { type: 'string', description: 'Dropoff address' },
    dropoffPhoneNumber: { type: 'string', description: 'Dropoff phone number' },
    dropoffBusinessName: { type: 'string', description: 'Dropoff contact name' },
    orderValue: { type: 'string', description: 'Order value in cents' },
    dropoffContactGivenName: { type: 'string', description: 'Recipient first name' },
    dropoffContactFamilyName: { type: 'string', description: 'Recipient last name' },
    pickupInstructions: { type: 'string', description: 'Pickup instructions' },
    dropoffInstructions: { type: 'string', description: 'Dropoff instructions' },
    tip: { type: 'string', description: 'Tip amount in cents' },
    pickupTime: { type: 'string', description: 'Scheduled pickup time (ISO 8601)' },
    dropoffTime: { type: 'string', description: 'Scheduled dropoff time (ISO 8601)' },
    contactlessDropoff: { type: 'string', description: 'Contactless dropoff' },
    dropoffRequiresSignature: { type: 'string', description: 'Require signature' },
    dropoffContactSendNotifications: { type: 'string', description: 'Send SMS notifications' },
    actionIfUndeliverable: { type: 'string', description: 'Action if undeliverable' },
    externalBusinessId: { type: 'string', description: 'Business ID' },
    name: { type: 'string', description: 'Business or store name' },
    description: { type: 'string', description: 'Business description' },
    externalStoreId: { type: 'string', description: 'Store ID' },
    phoneNumber: { type: 'string', description: 'Store phone number' },
    address: { type: 'string', description: 'Store address' },
  },
  outputs: {
    externalDeliveryId: { type: 'string', description: 'External delivery ID' },
    deliveryStatus: { type: 'string', description: 'Delivery status' },
    fee: { type: 'number', description: 'Delivery fee in cents' },
    tip: { type: 'number', description: 'Tip amount in cents' },
    orderValue: { type: 'number', description: 'Order value in cents' },
    currency: { type: 'string', description: 'Fee currency code' },
    trackingUrl: { type: 'string', description: 'Delivery tracking URL' },
    supportReference: { type: 'string', description: 'Support reference ID' },
    dasherName: { type: 'string', description: 'Assigned Dasher name' },
    dasherId: { type: 'number', description: 'Assigned Dasher ID' },
    contactlessDropoff: { type: 'boolean', description: 'Whether contactless dropoff was used' },
    dropoffVerificationImageUrl: { type: 'string', description: 'Photo verification URL' },
    cancellationReason: { type: 'string', description: 'Reason for cancellation' },
    pickupTimeEstimated: { type: 'string', description: 'Estimated pickup time' },
    pickupTimeActual: { type: 'string', description: 'Actual pickup time' },
    dropoffTimeEstimated: { type: 'string', description: 'Estimated dropoff time' },
    dropoffTimeActual: { type: 'string', description: 'Actual dropoff time' },
    pickupAddress: { type: 'string', description: 'Pickup address' },
    dropoffAddress: { type: 'string', description: 'Dropoff address' },
    updatedAt: { type: 'string', description: 'Last updated timestamp' },
    externalBusinessId: { type: 'string', description: 'Business ID' },
    externalStoreId: { type: 'string', description: 'Store ID' },
    name: { type: 'string', description: 'Business or store name' },
    businesses: {
      type: 'json',
      description: 'List of businesses (externalBusinessId, name, description, activationStatus)',
    },
    stores: {
      type: 'json',
      description: 'List of stores (externalStoreId, name, phoneNumber, address)',
    },
  },
}

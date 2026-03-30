import { createLogger } from '@sim/logger'
import { SignJWT } from 'jose'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'

const logger = createLogger('DoordashAPI')

const DOORDASH_BASE_URL = 'https://openapi.doordash.com'
const DRIVE_V2 = `${DOORDASH_BASE_URL}/drive/v2`
const DEVELOPER_V1 = `${DOORDASH_BASE_URL}/developer/v1`

const RequestSchema = z.object({
  operation: z.enum([
    'create_quote',
    'accept_quote',
    'create_delivery',
    'get_delivery',
    'update_delivery',
    'cancel_delivery',
    'create_business',
    'list_businesses',
    'update_business',
    'create_store',
    'list_stores',
    'get_store',
    'update_store',
  ]),
  developerId: z.string(),
  keyId: z.string(),
  signingSecret: z.string(),
  externalDeliveryId: z.string().optional(),
  pickupAddress: z.string().optional(),
  pickupPhoneNumber: z.string().optional(),
  pickupBusinessName: z.string().optional(),
  dropoffAddress: z.string().optional(),
  dropoffPhoneNumber: z.string().optional(),
  dropoffBusinessName: z.string().optional(),
  orderValue: z.string().optional(),
  pickupInstructions: z.string().optional(),
  dropoffInstructions: z.string().optional(),
  tip: z.string().optional(),
  dropoffContactSendNotifications: z.string().optional(),
  actionIfUndeliverable: z.string().optional(),
  contactlessDropoff: z.string().optional(),
  dropoffRequiresSignature: z.string().optional(),
  dropoffContactGivenName: z.string().optional(),
  dropoffContactFamilyName: z.string().optional(),
  pickupTime: z.string().optional(),
  dropoffTime: z.string().optional(),
  externalBusinessId: z.string().optional(),
  externalStoreId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  phoneNumber: z.string().optional(),
  address: z.string().optional(),
})

/**
 * Generates a DoorDash JWT for API authentication.
 */
async function generateJwt(
  developerId: string,
  keyId: string,
  signingSecret: string
): Promise<string> {
  const decodedSecret = Buffer.from(signingSecret.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

  const now = Math.floor(Date.now() / 1000)

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: keyId, 'dd-ver': 'DD-JWT-V1' })
    .setIssuedAt(now)
    .setIssuer(developerId)
    .setAudience('doordash')
    .setExpirationTime(now + 300)
    .sign(decodedSecret)

  return jwt
}

/**
 * Extracts delivery output fields from a DoorDash API response.
 */
function extractDeliveryOutput(data: Record<string, unknown>) {
  return {
    externalDeliveryId: (data.external_delivery_id as string) ?? '',
    deliveryStatus: (data.delivery_status as string) ?? '',
    fee: (data.fee as number) ?? null,
    tip: (data.tip as number) ?? null,
    orderValue: (data.order_value as number) ?? null,
    currency: (data.currency as string) ?? null,
    trackingUrl: (data.tracking_url as string) ?? null,
    supportReference: (data.support_reference as string) ?? null,
    dasherName: (data.dasher_name as string) ?? null,
    dasherId: (data.dasher_id as number) ?? null,
    contactlessDropoff: (data.contactless_dropoff as boolean) ?? null,
    dropoffVerificationImageUrl: (data.dropoff_verification_image_url as string) ?? null,
    cancellationReason: (data.cancellation_reason as string) ?? null,
    pickupTimeEstimated: (data.pickup_time_estimated as string) ?? null,
    pickupTimeActual: (data.pickup_time_actual as string) ?? null,
    dropoffTimeEstimated: (data.dropoff_time_estimated as string) ?? null,
    dropoffTimeActual: (data.dropoff_time_actual as string) ?? null,
    pickupAddress: (data.pickup_address as string) ?? null,
    dropoffAddress: (data.dropoff_address as string) ?? null,
    updatedAt: (data.updated_at as string) ?? null,
  }
}

/**
 * Extracts business output fields from a DoorDash API response.
 */
function extractBusinessOutput(data: Record<string, unknown>) {
  return {
    externalBusinessId: (data.external_business_id as string) ?? '',
    name: (data.name as string) ?? '',
    description: (data.description as string) ?? null,
    activationStatus: (data.activation_status as string) ?? null,
  }
}

/**
 * Extracts store output fields from a DoorDash API response.
 */
function extractStoreOutput(data: Record<string, unknown>) {
  return {
    externalStoreId: (data.external_store_id as string) ?? '',
    name: (data.name as string) ?? '',
    phoneNumber: (data.phone_number as string) ?? null,
    address: (data.address as string) ?? null,
  }
}

export async function POST(request: NextRequest) {
  const authResult = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!authResult.success) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: z.infer<typeof RequestSchema>
  try {
    const raw = await request.json()
    body = RequestSchema.parse(raw)
  } catch (error) {
    logger.error('Invalid request body', { error })
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  let jwt: string
  try {
    jwt = await generateJwt(body.developerId, body.keyId, body.signingSecret)
  } catch (error) {
    logger.error('Failed to generate JWT', { error })
    return NextResponse.json(
      { success: false, error: 'Failed to generate DoorDash JWT. Check your credentials.' },
      { status: 400 }
    )
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  }

  try {
    let url: string
    let method: string
    let requestBody: Record<string, unknown> | undefined

    switch (body.operation) {
      case 'create_quote': {
        url = `${DRIVE_V2}/quotes`
        method = 'POST'
        requestBody = {
          external_delivery_id: body.externalDeliveryId?.trim(),
          pickup_address: body.pickupAddress,
          pickup_phone_number: body.pickupPhoneNumber,
          pickup_business_name: body.pickupBusinessName,
          dropoff_address: body.dropoffAddress,
          dropoff_phone_number: body.dropoffPhoneNumber,
          dropoff_business_name: body.dropoffBusinessName,
          order_value: Number(body.orderValue),
          ...(body.pickupInstructions && { pickup_instructions: body.pickupInstructions }),
          ...(body.dropoffInstructions && { dropoff_instructions: body.dropoffInstructions }),
          ...(body.tip && { tip: Number(body.tip) }),
          ...(body.dropoffContactSendNotifications && {
            dropoff_contact_send_notifications: body.dropoffContactSendNotifications === 'true',
          }),
          ...(body.actionIfUndeliverable && {
            action_if_undeliverable: body.actionIfUndeliverable,
          }),
          ...(body.contactlessDropoff && {
            contactless_dropoff: body.contactlessDropoff === 'true',
          }),
          ...(body.dropoffRequiresSignature && {
            dropoff_requires_signature: body.dropoffRequiresSignature === 'true',
          }),
          ...(body.dropoffContactGivenName && {
            dropoff_contact_given_name: body.dropoffContactGivenName,
          }),
          ...(body.dropoffContactFamilyName && {
            dropoff_contact_family_name: body.dropoffContactFamilyName,
          }),
          ...(body.pickupTime && { pickup_time: body.pickupTime }),
          ...(body.dropoffTime && { dropoff_time: body.dropoffTime }),
        }
        break
      }

      case 'accept_quote': {
        url = `${DRIVE_V2}/quotes/${encodeURIComponent(body.externalDeliveryId?.trim() ?? '')}/accept`
        method = 'POST'
        requestBody = {
          ...(body.tip && { tip: Number(body.tip) }),
          ...(body.dropoffPhoneNumber && { dropoff_phone_number: body.dropoffPhoneNumber }),
        }
        break
      }

      case 'create_delivery': {
        url = `${DRIVE_V2}/deliveries`
        method = 'POST'
        requestBody = {
          external_delivery_id: body.externalDeliveryId?.trim(),
          pickup_address: body.pickupAddress,
          pickup_phone_number: body.pickupPhoneNumber,
          pickup_business_name: body.pickupBusinessName,
          dropoff_address: body.dropoffAddress,
          dropoff_phone_number: body.dropoffPhoneNumber,
          dropoff_business_name: body.dropoffBusinessName,
          order_value: Number(body.orderValue),
          ...(body.pickupInstructions && { pickup_instructions: body.pickupInstructions }),
          ...(body.dropoffInstructions && { dropoff_instructions: body.dropoffInstructions }),
          ...(body.tip && { tip: Number(body.tip) }),
          ...(body.dropoffContactSendNotifications && {
            dropoff_contact_send_notifications: body.dropoffContactSendNotifications === 'true',
          }),
          ...(body.actionIfUndeliverable && {
            action_if_undeliverable: body.actionIfUndeliverable,
          }),
          ...(body.contactlessDropoff && {
            contactless_dropoff: body.contactlessDropoff === 'true',
          }),
          ...(body.dropoffRequiresSignature && {
            dropoff_requires_signature: body.dropoffRequiresSignature === 'true',
          }),
          ...(body.dropoffContactGivenName && {
            dropoff_contact_given_name: body.dropoffContactGivenName,
          }),
          ...(body.dropoffContactFamilyName && {
            dropoff_contact_family_name: body.dropoffContactFamilyName,
          }),
          ...(body.pickupTime && { pickup_time: body.pickupTime }),
          ...(body.dropoffTime && { dropoff_time: body.dropoffTime }),
        }
        break
      }

      case 'get_delivery': {
        url = `${DRIVE_V2}/deliveries/${encodeURIComponent(body.externalDeliveryId?.trim() ?? '')}`
        method = 'GET'
        break
      }

      case 'update_delivery': {
        url = `${DRIVE_V2}/deliveries/${encodeURIComponent(body.externalDeliveryId?.trim() ?? '')}`
        method = 'PATCH'
        requestBody = {
          ...(body.tip && { tip: Number(body.tip) }),
          ...(body.dropoffPhoneNumber && { dropoff_phone_number: body.dropoffPhoneNumber }),
          ...(body.dropoffInstructions && { dropoff_instructions: body.dropoffInstructions }),
        }
        break
      }

      case 'cancel_delivery': {
        url = `${DRIVE_V2}/deliveries/${encodeURIComponent(body.externalDeliveryId?.trim() ?? '')}/cancel`
        method = 'PUT'
        requestBody = {}
        break
      }

      case 'create_business': {
        url = `${DEVELOPER_V1}/businesses`
        method = 'POST'
        requestBody = {
          external_business_id: body.externalBusinessId?.trim(),
          name: body.name,
          ...(body.description && { description: body.description }),
        }
        break
      }

      case 'list_businesses': {
        url = `${DEVELOPER_V1}/businesses`
        method = 'GET'
        break
      }

      case 'update_business': {
        url = `${DEVELOPER_V1}/businesses/${encodeURIComponent(body.externalBusinessId?.trim() ?? '')}`
        method = 'PATCH'
        requestBody = {
          ...(body.name && { name: body.name }),
          ...(body.description && { description: body.description }),
        }
        break
      }

      case 'create_store': {
        url = `${DEVELOPER_V1}/businesses/${encodeURIComponent(body.externalBusinessId?.trim() ?? '')}/stores`
        method = 'POST'
        requestBody = {
          external_store_id: body.externalStoreId?.trim(),
          name: body.name,
          phone_number: body.phoneNumber,
          address: body.address,
        }
        break
      }

      case 'list_stores': {
        url = `${DEVELOPER_V1}/businesses/${encodeURIComponent(body.externalBusinessId?.trim() ?? '')}/stores`
        method = 'GET'
        break
      }

      case 'get_store': {
        url = `${DEVELOPER_V1}/businesses/${encodeURIComponent(body.externalBusinessId?.trim() ?? '')}/stores/${encodeURIComponent(body.externalStoreId?.trim() ?? '')}`
        method = 'GET'
        break
      }

      case 'update_store': {
        url = `${DEVELOPER_V1}/businesses/${encodeURIComponent(body.externalBusinessId?.trim() ?? '')}/stores/${encodeURIComponent(body.externalStoreId?.trim() ?? '')}`
        method = 'PATCH'
        requestBody = {
          ...(body.name && { name: body.name }),
          ...(body.phoneNumber && { phone_number: body.phoneNumber }),
          ...(body.address && { address: body.address }),
        }
        break
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      ...(requestBody && { body: JSON.stringify(requestBody) }),
    }

    const response = await fetch(url, fetchOptions)
    const data = await response.json()

    if (!response.ok) {
      const errorMessage =
        (data as Record<string, unknown>).message ??
        (data as Record<string, unknown>).error ??
        `DoorDash API error (${response.status})`
      logger.error('DoorDash API error', { status: response.status, error: errorMessage })
      return NextResponse.json(
        { success: false, error: String(errorMessage) },
        { status: response.status }
      )
    }

    let output: Record<string, unknown>

    switch (body.operation) {
      case 'list_businesses': {
        const results = Array.isArray(data) ? data : (data as Record<string, unknown>).result ?? []
        output = {
          businesses: (results as Record<string, unknown>[]).map(extractBusinessOutput),
        }
        break
      }
      case 'create_business':
      case 'update_business': {
        output = extractBusinessOutput(data as Record<string, unknown>)
        break
      }
      case 'list_stores': {
        const results = Array.isArray(data) ? data : (data as Record<string, unknown>).result ?? []
        output = {
          stores: (results as Record<string, unknown>[]).map(extractStoreOutput),
        }
        break
      }
      case 'create_store':
      case 'get_store':
      case 'update_store': {
        output = extractStoreOutput(data as Record<string, unknown>)
        break
      }
      default: {
        output = extractDeliveryOutput(data as Record<string, unknown>)
        break
      }
    }

    return NextResponse.json({ success: true, output })
  } catch (error) {
    logger.error('DoorDash API request failed', { error })
    return NextResponse.json(
      { success: false, error: 'Failed to communicate with DoorDash API' },
      { status: 500 }
    )
  }
}

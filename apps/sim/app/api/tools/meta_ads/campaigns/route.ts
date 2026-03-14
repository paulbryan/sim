import { createLogger } from '@sim/logger'
import { NextResponse } from 'next/server'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { generateRequestId } from '@/lib/core/utils/request'
import { refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'
import { getMetaApiBaseUrl, stripActPrefix } from '@/tools/meta_ads/types'

export const dynamic = 'force-dynamic'

const logger = createLogger('MetaAdsCampaignsAPI')

interface MetaCampaign {
  id: string
  name: string
  status: string
}

export async function POST(request: Request) {
  try {
    const requestId = generateRequestId()
    const body = await request.json()
    const { credential, workflowId, accountId } = body

    if (!credential) {
      logger.error('Missing credential in request')
      return NextResponse.json({ error: 'Credential is required' }, { status: 400 })
    }

    if (!accountId) {
      logger.error('Missing accountId in request')
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 })
    }

    const authz = await authorizeCredentialUse(request as any, {
      credentialId: credential,
      workflowId,
    })
    if (!authz.ok || !authz.credentialOwnerUserId) {
      return NextResponse.json({ error: authz.error || 'Unauthorized' }, { status: 403 })
    }

    const accessToken = await refreshAccessTokenIfNeeded(
      credential,
      authz.credentialOwnerUserId,
      requestId
    )
    if (!accessToken) {
      logger.error('Failed to get access token', {
        credentialId: credential,
        userId: authz.credentialOwnerUserId,
      })
      return NextResponse.json(
        { error: 'Could not retrieve access token', authRequired: true },
        { status: 401 }
      )
    }

    const trimmedId = stripActPrefix(String(accountId))
    const url = `${getMetaApiBaseUrl()}/act_${trimmedId}/campaigns?fields=id,name,status&limit=200`
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const errorData = await response.json()
      const errorMessage = errorData?.error?.message ?? 'Failed to fetch campaigns'
      logger.error('Meta API error', { status: response.status, error: errorMessage })
      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    const data = await response.json()
    const items: MetaCampaign[] = data.data ?? []

    const campaigns = items.map((campaign) => ({
      id: campaign.id,
      name: campaign.name || `Campaign ${campaign.id}`,
      status: campaign.status,
    }))

    logger.info(`Successfully fetched ${campaigns.length} Meta campaigns`, {
      accountId: trimmedId,
      total: campaigns.length,
    })

    return NextResponse.json({ campaigns })
  } catch (error) {
    logger.error('Error processing Meta campaigns request:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve campaigns', details: (error as Error).message },
      { status: 500 }
    )
  }
}

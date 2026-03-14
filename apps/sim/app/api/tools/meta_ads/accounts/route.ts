import { createLogger } from '@sim/logger'
import { NextResponse } from 'next/server'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { generateRequestId } from '@/lib/core/utils/request'
import { refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'
import { getMetaApiBaseUrl } from '@/tools/meta_ads/types'

export const dynamic = 'force-dynamic'

const logger = createLogger('MetaAdsAccountsAPI')

interface MetaAdAccount {
  id: string
  account_id: string
  name: string
  account_status: number
}

export async function POST(request: Request) {
  try {
    const requestId = generateRequestId()
    const body = await request.json()
    const { credential, workflowId } = body

    if (!credential) {
      logger.error('Missing credential in request')
      return NextResponse.json({ error: 'Credential is required' }, { status: 400 })
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

    const url = `${getMetaApiBaseUrl()}/me/adaccounts?fields=account_id,name,account_status&limit=200`
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const errorData = await response.json()
      const errorMessage = errorData?.error?.message ?? 'Failed to fetch ad accounts'
      logger.error('Meta API error', { status: response.status, error: errorMessage })
      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    const data = await response.json()
    const items: MetaAdAccount[] = data.data ?? []

    const META_ACCOUNT_STATUS: Record<number, string> = {
      1: 'Active',
      2: 'Disabled',
      3: 'Unsettled',
      7: 'Pending Risk Review',
      8: 'Pending Settlement',
      9: 'In Grace Period',
      100: 'Pending Closure',
      101: 'Closed',
      201: 'Any Active',
      202: 'Any Closed',
    }

    const accounts = items.map((account) => {
      const statusLabel = META_ACCOUNT_STATUS[account.account_status] ?? 'Unknown'
      const suffix = account.account_status !== 1 ? ` (${statusLabel})` : ''
      return {
        id: account.account_id,
        name: `${account.name || `Account ${account.account_id}`}${suffix}`,
      }
    })

    logger.info(`Successfully fetched ${accounts.length} Meta ad accounts`, {
      total: items.length,
      active: accounts.length,
    })

    return NextResponse.json({ accounts })
  } catch (error) {
    logger.error('Error processing Meta ad accounts request:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve ad accounts', details: (error as Error).message },
      { status: 500 }
    )
  }
}

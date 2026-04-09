import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'

const ENV_URLS: Record<string, string | undefined> = {
  dev: env.MOTHERSHIP_DEV_URL,
  staging: env.MOTHERSHIP_STAGING_URL,
  prod: env.MOTHERSHIP_PROD_URL,
}

function getMothershipUrl(environment: string): string | null {
  return ENV_URLS[environment] ?? null
}

/**
 * Proxy to the mothership admin API.
 *
 * Query params:
 *   env       - "dev" | "staging" | "prod"
 *   endpoint  - the admin endpoint path, e.g. "requests", "licenses", "traces"
 *
 * The request body (for POST) is forwarded as-is. Additional query params
 * (e.g. requestId for GET /traces) are forwarded.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminKey = env.MOTHERSHIP_API_ADMIN_KEY
  if (!adminKey) {
    return NextResponse.json({ error: 'MOTHERSHIP_API_ADMIN_KEY not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const environment = searchParams.get('env') || 'dev'
  const endpoint = searchParams.get('endpoint')

  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint query param required' }, { status: 400 })
  }

  const baseUrl = getMothershipUrl(environment)
  if (!baseUrl) {
    return NextResponse.json(
      { error: `No URL configured for environment: ${environment}` },
      { status: 400 }
    )
  }

  const targetUrl = `${baseUrl}/api/admin/${endpoint}`

  try {
    const body = await req.text()
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': adminKey,
      },
      ...(body ? { body } : {}),
    })

    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    return NextResponse.json(
      {
        error: `Failed to reach mothership (${environment}): ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 502 }
    )
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminKey = env.MOTHERSHIP_API_ADMIN_KEY
  if (!adminKey) {
    return NextResponse.json({ error: 'MOTHERSHIP_API_ADMIN_KEY not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const environment = searchParams.get('env') || 'dev'
  const endpoint = searchParams.get('endpoint')

  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint query param required' }, { status: 400 })
  }

  const baseUrl = getMothershipUrl(environment)
  if (!baseUrl) {
    return NextResponse.json(
      { error: `No URL configured for environment: ${environment}` },
      { status: 400 }
    )
  }

  const forwardParams = new URLSearchParams()
  searchParams.forEach((value, key) => {
    if (key !== 'env' && key !== 'endpoint') {
      forwardParams.set(key, value)
    }
  })

  const qs = forwardParams.toString()
  const targetUrl = `${baseUrl}/api/admin/${endpoint}${qs ? `?${qs}` : ''}`

  try {
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'x-api-key': adminKey },
    })

    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    return NextResponse.json(
      {
        error: `Failed to reach mothership (${environment}): ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 502 }
    )
  }
}

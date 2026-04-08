import { toNextJsHandler } from 'better-auth/next-js'
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAnonymousGetSessionResponse, ensureAnonymousUserExists } from '@/lib/auth/anonymous'
import { isAuthDisabled } from '@/lib/core/config/feature-flags'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

export const dynamic = 'force-dynamic'

const { GET: betterAuthGET, POST: betterAuthPOST } = toNextJsHandler(auth.handler)

export const GET = withRouteHandler(async (request: NextRequest) => {
  const url = new URL(request.url)
  const path = url.pathname.replace('/api/auth/', '')

  if (path === 'get-session' && isAuthDisabled) {
    await ensureAnonymousUserExists()
    return NextResponse.json(createAnonymousGetSessionResponse())
  }

  return betterAuthGET(request)
})

export const POST = withRouteHandler(betterAuthPOST)

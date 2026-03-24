import { db } from '@sim/db'
import { agent } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { executeAgent } from '@/lib/agents/execute'
import type { AgentConfig } from '@/lib/agents/types'
import { generateRequestId } from '@/lib/core/utils/request'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'
import { checkRateLimit, createRateLimitResponse } from '@/app/api/v1/middleware'

const logger = createLogger('V1AgentAPI')

export const dynamic = 'force-dynamic'

interface RouteParams {
  agentId: string
}

const ExecuteSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  conversationId: z.string().optional(),
})

/**
 * POST /api/v1/agents/{agentId}
 * Execute an agent via the public API. Requires a workspace or personal API key.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const requestId = generateRequestId()
  const { agentId } = await params

  try {
    const rateLimit = await checkRateLimit(request, 'agent-detail')
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit)
    }

    const userId = rateLimit.userId!

    const body = await request.json()
    const parsed = ExecuteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const [agentRow] = await db
      .select()
      .from(agent)
      .where(and(eq(agent.id, agentId), isNull(agent.archivedAt), eq(agent.isDeployed, true)))
      .limit(1)

    if (!agentRow) {
      return NextResponse.json({ error: 'Agent not found or not deployed' }, { status: 404 })
    }

    const access = await checkWorkspaceAccess(agentRow.workspaceId, userId)
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { message, conversationId } = parsed.data
    const memoryConversationId = conversationId
      ? `agent:${agentId}:api:${conversationId}`
      : undefined

    logger.info(`[${requestId}] V1 API executing agent ${agentId}`, { userId })

    const result = await executeAgent({
      config: agentRow.config as AgentConfig,
      message,
      conversationId: memoryConversationId,
      agentId,
      workspaceId: agentRow.workspaceId,
      userId,
      isDeployedContext: true,
    })

    const streamingResult =
      result && typeof result === 'object' && 'stream' in result
        ? (result as { stream: unknown }).stream
        : null
    if (streamingResult instanceof ReadableStream) {
      return new NextResponse(streamingResult, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    return NextResponse.json({ success: true, data: result as Record<string, unknown> })
  } catch (error) {
    logger.error(`[${requestId}] V1 agent execution failed for ${agentId}`, { error })
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 })
  }
}

import { db } from '@sim/db'
import { agent } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { executeAgent } from '@/lib/agents/execute'
import type { AgentConfig } from '@/lib/agents/types'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('AgentExecuteAPI')

export const dynamic = 'force-dynamic'

interface RouteParams {
  agentId: string
}

const ExecuteAgentSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  conversationId: z.string().optional(),
})

/**
 * POST /api/agents/{agentId}/execute
 * Test-execute an agent from the UI. Requires an active session.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const requestId = generateRequestId()
  const { agentId } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = ExecuteAgentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const [row] = await db
      .select()
      .from(agent)
      .where(and(eq(agent.id, agentId), isNull(agent.archivedAt)))
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const access = await checkWorkspaceAccess(row.workspaceId, session.user.id)
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { message, conversationId } = parsed.data

    const memoryConversationId = conversationId ?? `agent:${agentId}:test:${session.user.id}`

    logger.info(`[${requestId}] Executing agent ${agentId}`, { userId: session.user.id })

    const result = await executeAgent({
      config: row.config as AgentConfig,
      message,
      conversationId: memoryConversationId,
      agentId,
      workspaceId: row.workspaceId,
      userId: session.user.id,
      isDeployedContext: false,
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
    logger.error(`[${requestId}] Agent execution failed for ${agentId}`, { error })
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 })
  }
}

import { db } from '@sim/db'
import { agent } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('AgentsAPI')

export const dynamic = 'force-dynamic'

type AgentQueryScope = 'active' | 'archived' | 'all'

const CreateAgentSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
  description: z.string().optional(),
  config: z.record(z.unknown()).default({}),
})

/**
 * GET /api/agents?workspaceId={id}&scope=active|archived|all
 * List agents for a workspace.
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized agents list access`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const scopeParam = (searchParams.get('scope') ?? 'active') as AgentQueryScope

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    if (!['active', 'archived', 'all'].includes(scopeParam)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    }

    const access = await checkWorkspaceAccess(workspaceId, session.user.id)
    if (!access.exists) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const conditions = [eq(agent.workspaceId, workspaceId)]
    if (scopeParam === 'active') conditions.push(isNull(agent.archivedAt))
    if (scopeParam === 'archived') conditions.push(isNotNull(agent.archivedAt))

    const agents = await db
      .select()
      .from(agent)
      .where(and(...conditions))
      .orderBy(agent.updatedAt)

    return NextResponse.json({ success: true, data: agents })
  } catch (error) {
    logger.error(`[${requestId}] Failed to list agents`, { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/agents
 * Create a new agent.
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized agent create attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CreateAgentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const { workspaceId, name, description, config } = parsed.data

    const access = await checkWorkspaceAccess(workspaceId, session.user.id)
    if (!access.exists) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [created] = await db
      .insert(agent)
      .values({
        id: uuidv4(),
        workspaceId,
        createdBy: session.user.id,
        name,
        description,
        config,
      })
      .returning()

    logger.info(`[${requestId}] Agent created`, { agentId: created.id, workspaceId })

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    logger.error(`[${requestId}] Failed to create agent`, { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

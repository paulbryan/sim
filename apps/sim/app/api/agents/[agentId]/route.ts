import { db } from '@sim/db'
import { agent, agentDeployment } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('AgentByIdAPI')

export const dynamic = 'force-dynamic'

interface RouteParams {
  agentId: string
}

const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  isDeployed: z.boolean().optional(),
})

/**
 * GET /api/agents/{agentId}
 * Get a single agent with its deployments.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const requestId = generateRequestId()
  const { agentId } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const deployments = await db
      .select()
      .from(agentDeployment)
      .where(eq(agentDeployment.agentId, agentId))

    return NextResponse.json({ success: true, data: { ...row, deployments } })
  } catch (error) {
    logger.error(`[${requestId}] Failed to get agent ${agentId}`, { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/{agentId}
 * Update an agent's name, description, or config.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const requestId = generateRequestId()
  const { agentId } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = UpdateAgentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const [row] = await db
      .select({ id: agent.id, workspaceId: agent.workspaceId })
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

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.description !== undefined) updates.description = parsed.data.description
    if (parsed.data.config !== undefined) updates.config = parsed.data.config
    if (parsed.data.isDeployed !== undefined) {
      updates.isDeployed = parsed.data.isDeployed
      if (parsed.data.isDeployed) updates.deployedAt = new Date()
    }

    const [updated] = await db.update(agent).set(updates).where(eq(agent.id, agentId)).returning()

    logger.info(`[${requestId}] Agent updated`, { agentId })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    logger.error(`[${requestId}] Failed to update agent ${agentId}`, { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/{agentId}
 * Soft-delete an agent and deactivate all its deployments.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const requestId = generateRequestId()
  const { agentId } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [row] = await db
      .select({ id: agent.id, workspaceId: agent.workspaceId })
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

    await db
      .update(agentDeployment)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(agentDeployment.agentId, agentId))

    await db
      .update(agent)
      .set({ archivedAt: new Date(), isDeployed: false, updatedAt: new Date() })
      .where(eq(agent.id, agentId))

    logger.info(`[${requestId}] Agent archived`, { agentId })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error(`[${requestId}] Failed to delete agent ${agentId}`, { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

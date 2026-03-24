import { db } from '@sim/db'
import { account, agent, agentDeployment, credential } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('AgentSlackDeployAPI')

export const dynamic = 'force-dynamic'

interface RouteParams {
  agentId: string
}

const DeploySlackSchema = z.object({
  credentialId: z.string().min(1, 'Credential ID is required'),
  channelIds: z.array(z.string().min(1)).default([]),
  respondTo: z.enum(['mentions', 'all', 'threads', 'dm']),
  botName: z.string().max(80).optional(),
  replyInThread: z.boolean().default(true),
})

/**
 * POST /api/agents/{agentId}/deployments/slack
 * Configure a Slack deployment for an agent.
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
    const parsed = DeploySlackSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }
    if (parsed.data.respondTo !== 'dm' && parsed.data.channelIds.length === 0) {
      return NextResponse.json({ error: 'At least one channel is required' }, { status: 400 })
    }

    const [agentRow] = await db
      .select()
      .from(agent)
      .where(and(eq(agent.id, agentId), isNull(agent.archivedAt)))
      .limit(1)

    if (!agentRow) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const access = await checkWorkspaceAccess(agentRow.workspaceId, session.user.id)
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { credentialId, channelIds, respondTo, botName, replyInThread } = parsed.data

    const [credentialRow] = await db
      .select({
        id: credential.id,
        accountId: credential.accountId,
        workspaceId: credential.workspaceId,
      })
      .from(credential)
      .where(
        and(
          eq(credential.id, credentialId),
          eq(credential.workspaceId, agentRow.workspaceId),
          eq(credential.type, 'oauth'),
          eq(credential.providerId, 'slack')
        )
      )
      .limit(1)

    if (!credentialRow?.accountId) {
      return NextResponse.json({ error: 'Slack credential not found' }, { status: 404 })
    }

    const [accountRow] = await db
      .select({ accessToken: account.accessToken })
      .from(account)
      .where(eq(account.id, credentialRow.accountId))
      .limit(1)

    if (!accountRow?.accessToken) {
      return NextResponse.json({ error: 'Slack token not available' }, { status: 400 })
    }

    const authTest = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${accountRow.accessToken}` },
    })
    const authData = await authTest.json()
    if (!authData.ok) {
      logger.warn(`[${requestId}] Slack auth.test failed`, { error: authData.error })
      return NextResponse.json({ error: 'Failed to verify Slack token' }, { status: 400 })
    }

    const teamId: string = authData.team_id
    const botUserId: string = authData.user_id ?? ''

    if (!teamId || !botUserId) {
      logger.warn(`[${requestId}] Slack auth.test returned incomplete identity`, {
        teamId,
        botUserId,
      })
      return NextResponse.json(
        { error: 'Could not determine Slack workspace or bot identity' },
        { status: 400 }
      )
    }

    const existingDeployment = await db
      .select({ id: agentDeployment.id })
      .from(agentDeployment)
      .where(and(eq(agentDeployment.agentId, agentId), eq(agentDeployment.platform, 'slack')))
      .limit(1)

    const deploymentConfig: import('@/lib/agents/types').SlackDeploymentConfig = {
      teamId,
      botUserId,
      channelIds,
      respondTo,
      replyInThread,
      ...(botName ? { botName } : {}),
    }

    let deploymentRow: typeof agentDeployment.$inferSelect

    if (existingDeployment.length > 0) {
      const [updated] = await db
        .update(agentDeployment)
        .set({
          credentialId,
          config: deploymentConfig,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(agentDeployment.id, existingDeployment[0].id))
        .returning()
      deploymentRow = updated
    } else {
      const [inserted] = await db
        .insert(agentDeployment)
        .values({
          id: uuidv4(),
          agentId,
          platform: 'slack',
          credentialId,
          config: deploymentConfig,
          isActive: true,
        })
        .returning()
      deploymentRow = inserted
    }

    await db
      .update(agent)
      .set({ isDeployed: true, deployedAt: new Date(), updatedAt: new Date() })
      .where(eq(agent.id, agentId))

    logger.info(`[${requestId}] Agent ${agentId} deployed to Slack`, { teamId, channelIds })

    return NextResponse.json({ success: true, data: deploymentRow })
  } catch (error) {
    logger.error(`[${requestId}] Failed to deploy agent ${agentId} to Slack`, { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/{agentId}/deployments/slack
 * Remove a Slack deployment from an agent.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const requestId = generateRequestId()
  const { agentId } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [agentRow] = await db
      .select({ id: agent.id, workspaceId: agent.workspaceId })
      .from(agent)
      .where(and(eq(agent.id, agentId), isNull(agent.archivedAt)))
      .limit(1)

    if (!agentRow) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const access = await checkWorkspaceAccess(agentRow.workspaceId, session.user.id)
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db
      .delete(agentDeployment)
      .where(and(eq(agentDeployment.agentId, agentId), eq(agentDeployment.platform, 'slack')))

    const remainingDeployments = await db
      .select({ id: agentDeployment.id })
      .from(agentDeployment)
      .where(and(eq(agentDeployment.agentId, agentId), eq(agentDeployment.isActive, true)))
      .limit(1)

    if (remainingDeployments.length === 0) {
      await db
        .update(agent)
        .set({ isDeployed: false, updatedAt: new Date() })
        .where(eq(agent.id, agentId))
    }

    logger.info(`[${requestId}] Slack deployment removed for agent ${agentId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error(`[${requestId}] Failed to remove Slack deployment for agent ${agentId}`, { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

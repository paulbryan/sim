import { db } from '@sim/db'
import { workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AuditAction, AuditResourceType, recordAudit } from '@/lib/audit/log'
import { getSession } from '@/lib/auth'
import { getHighestPrioritySubscription } from '@/lib/billing/core/plan'
import { isEnterprisePlan } from '@/lib/billing/core/subscription'
import {
  checkEnterprisePlan,
  checkProPlan,
  checkTeamPlan,
} from '@/lib/billing/subscriptions/utils'
import { getWorkspaceBilledAccountUserId } from '@/lib/workspaces/utils'
import { getUserEntityPermissions } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('DataRetentionAPI')

const MIN_HOURS = 24
const MAX_HOURS = 43800 // 5 years

const FREE_LOG_RETENTION_HOURS = 7 * 24
const FREE_SOFT_DELETE_RETENTION_HOURS = 7 * 24
const FREE_TASK_REDACTION_HOURS = null // never

const PRO_LOG_RETENTION_HOURS = 30 * 24
const PRO_SOFT_DELETE_RETENTION_HOURS = 30 * 24
const PRO_TASK_REDACTION_HOURS = 30 * 24

interface PlanDefaults {
  logRetentionHours: number
  softDeleteRetentionHours: number
  taskRedactionHours: number | null
}

function getPlanDefaults(plan: 'free' | 'pro' | 'enterprise'): PlanDefaults {
  switch (plan) {
    case 'enterprise':
    case 'pro':
      return {
        logRetentionHours: PRO_LOG_RETENTION_HOURS,
        softDeleteRetentionHours: PRO_SOFT_DELETE_RETENTION_HOURS,
        taskRedactionHours: PRO_TASK_REDACTION_HOURS,
      }
    default:
      return {
        logRetentionHours: FREE_LOG_RETENTION_HOURS,
        softDeleteRetentionHours: FREE_SOFT_DELETE_RETENTION_HOURS,
        taskRedactionHours: FREE_TASK_REDACTION_HOURS,
      }
  }
}

async function resolveWorkspacePlan(
  billedAccountUserId: string
): Promise<'free' | 'pro' | 'enterprise'> {
  const sub = await getHighestPrioritySubscription(billedAccountUserId)
  if (!sub) return 'free'
  if (checkEnterprisePlan(sub)) return 'enterprise'
  if (checkTeamPlan(sub) || checkProPlan(sub)) return 'pro'
  return 'free'
}

const updateRetentionSchema = z.object({
  logRetentionHours: z.number().int().min(MIN_HOURS).max(MAX_HOURS).nullable().optional(),
  softDeleteRetentionHours: z.number().int().min(MIN_HOURS).max(MAX_HOURS).nullable().optional(),
  taskRedactionHours: z.number().int().min(MIN_HOURS).max(MAX_HOURS).nullable().optional(),
})

/**
 * GET /api/workspaces/[id]/data-retention
 * Returns the workspace's data retention config including plan defaults and
 * whether the workspace is on an enterprise plan.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: workspaceId } = await params

    const permission = await getUserEntityPermissions(session.user.id, 'workspace', workspaceId)
    if (!permission) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 404 })
    }

    const [ws] = await db
      .select({
        logRetentionHours: workspace.logRetentionHours,
        softDeleteRetentionHours: workspace.softDeleteRetentionHours,
        taskRedactionHours: workspace.taskRedactionHours,
        billedAccountUserId: workspace.billedAccountUserId,
      })
      .from(workspace)
      .where(eq(workspace.id, workspaceId))
      .limit(1)

    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const plan = await resolveWorkspacePlan(ws.billedAccountUserId)
    const defaults = getPlanDefaults(plan)
    const isEnterpriseWorkspace = plan === 'enterprise'

    return NextResponse.json({
      success: true,
      data: {
        plan,
        isEnterprise: isEnterpriseWorkspace,
        defaults,
        configured: {
          logRetentionHours: ws.logRetentionHours,
          softDeleteRetentionHours: ws.softDeleteRetentionHours,
          taskRedactionHours: ws.taskRedactionHours,
        },
        effective: isEnterpriseWorkspace
          ? {
              logRetentionHours: ws.logRetentionHours,
              softDeleteRetentionHours: ws.softDeleteRetentionHours,
              taskRedactionHours: ws.taskRedactionHours,
            }
          : {
              logRetentionHours: defaults.logRetentionHours,
              softDeleteRetentionHours: defaults.softDeleteRetentionHours,
              taskRedactionHours: defaults.taskRedactionHours,
            },
      },
    })
  } catch (error) {
    logger.error('Failed to get data retention settings', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/workspaces/[id]/data-retention
 * Updates the workspace's data retention settings.
 * Requires admin permission and enterprise plan.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: workspaceId } = await params

    const permission = await getUserEntityPermissions(session.user.id, 'workspace', workspaceId)
    if (permission !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const billedAccountUserId = await getWorkspaceBilledAccountUserId(workspaceId)
    if (!billedAccountUserId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const hasEnterprise = await isEnterprisePlan(billedAccountUserId)
    if (!hasEnterprise) {
      return NextResponse.json(
        { error: 'Data Retention configuration is available on Enterprise plans only' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parsed = updateRetentionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (parsed.data.logRetentionHours !== undefined) {
      updateData.logRetentionHours = parsed.data.logRetentionHours
    }
    if (parsed.data.softDeleteRetentionHours !== undefined) {
      updateData.softDeleteRetentionHours = parsed.data.softDeleteRetentionHours
    }
    if (parsed.data.taskRedactionHours !== undefined) {
      updateData.taskRedactionHours = parsed.data.taskRedactionHours
    }

    const [updated] = await db
      .update(workspace)
      .set(updateData)
      .where(eq(workspace.id, workspaceId))
      .returning({
        logRetentionHours: workspace.logRetentionHours,
        softDeleteRetentionHours: workspace.softDeleteRetentionHours,
        taskRedactionHours: workspace.taskRedactionHours,
      })

    if (!updated) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    recordAudit({
      workspaceId,
      actorId: session.user.id,
      action: AuditAction.ORGANIZATION_UPDATED,
      resourceType: AuditResourceType.WORKSPACE,
      resourceId: workspaceId,
      actorName: session.user.name ?? undefined,
      actorEmail: session.user.email ?? undefined,
      description: 'Updated data retention settings',
      metadata: { changes: parsed.data },
      request,
    })

    const defaults = getPlanDefaults('enterprise')

    return NextResponse.json({
      success: true,
      data: {
        plan: 'enterprise' as const,
        isEnterprise: true,
        defaults,
        configured: {
          logRetentionHours: updated.logRetentionHours,
          softDeleteRetentionHours: updated.softDeleteRetentionHours,
          taskRedactionHours: updated.taskRedactionHours,
        },
        effective: {
          logRetentionHours: updated.logRetentionHours ?? defaults.logRetentionHours,
          softDeleteRetentionHours:
            updated.softDeleteRetentionHours ?? defaults.softDeleteRetentionHours,
          taskRedactionHours: updated.taskRedactionHours ?? defaults.taskRedactionHours,
        },
      },
    })
  } catch (error) {
    logger.error('Failed to update data retention settings', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

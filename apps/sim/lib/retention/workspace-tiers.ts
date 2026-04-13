import { db } from '@sim/db'
import { subscription, workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import { sqlIsPaid, sqlIsPro, sqlIsTeam } from '@/lib/billing/plan-helpers'
import { ENTITLED_SUBSCRIPTION_STATUSES } from '@/lib/billing/subscriptions/utils'
import { env } from '@/lib/core/config/env'

const logger = createLogger('WorkspaceTiers')

export interface RetentionGroup {
  workspaceIds: string[]
  retentionDate: Date
  tierLabel: string
}

type RetentionColumn =
  | 'logRetentionHours'
  | 'softDeleteRetentionHours'
  | 'taskRedactionHours'
  | 'taskCleanupHours'

/**
 * Resolve all workspaces into retention groups based on their plan tier
 * and any enterprise-configured retention overrides.
 *
 * Returns groups with computed retention dates, ready for batch processing.
 * Enterprise workspaces with NULL retention are excluded (no cleanup).
 */
export async function resolveRetentionGroups(
  retentionColumn: RetentionColumn
): Promise<RetentionGroup[]> {
  const freeRetentionDays = Number(env.FREE_PLAN_LOG_RETENTION_DAYS || '7')
  const paidRetentionDays = Number(env.PAID_PLAN_LOG_RETENTION_DAYS || '30')

  const now = Date.now()
  const freeRetentionDate = new Date(now - freeRetentionDays * 24 * 60 * 60 * 1000)
  const paidRetentionDate = new Date(now - paidRetentionDays * 24 * 60 * 60 * 1000)

  logger.info(`Resolving retention groups for ${retentionColumn}`, {
    freeRetentionDays,
    paidRetentionDays,
    freeRetentionDate: freeRetentionDate.toISOString(),
    paidRetentionDate: paidRetentionDate.toISOString(),
  })

  const groups: RetentionGroup[] = []

  // --- Free workspaces (no paid subscription) ---

  const freeWorkspaceRows = await db
    .select({ id: workspace.id })
    .from(workspace)
    .leftJoin(
      subscription,
      and(
        eq(subscription.referenceId, workspace.billedAccountUserId),
        inArray(subscription.status, ENTITLED_SUBSCRIPTION_STATUSES),
        sqlIsPaid(subscription.plan)
      )
    )
    .where(and(isNull(subscription.id), isNull(workspace.archivedAt)))

  const freeIds = freeWorkspaceRows.map((w) => w.id)
  if (freeIds.length > 0) {
    groups.push({
      workspaceIds: freeIds,
      retentionDate: freeRetentionDate,
      tierLabel: 'free',
    })
  }
  logger.info(`[free] Found ${freeIds.length} workspaces, retention cutoff: ${freeRetentionDate.toISOString()}`)

  // --- Pro/Team workspaces (paid non-enterprise) ---

  const paidWorkspaceRows = await db
    .select({ id: workspace.id })
    .from(workspace)
    .innerJoin(
      subscription,
      and(
        eq(subscription.referenceId, workspace.billedAccountUserId),
        inArray(subscription.status, ENTITLED_SUBSCRIPTION_STATUSES),
        or(sqlIsPro(subscription.plan)!, sqlIsTeam(subscription.plan)!)
      )
    )
    .where(isNull(workspace.archivedAt))

  const paidIds = paidWorkspaceRows.map((w) => w.id)
  if (paidIds.length > 0) {
    groups.push({
      workspaceIds: paidIds,
      retentionDate: paidRetentionDate,
      tierLabel: 'paid',
    })
  }
  logger.info(`[paid] Found ${paidIds.length} workspaces, retention cutoff: ${paidRetentionDate.toISOString()}`)

  // --- Enterprise with custom retention ---
  // Enterprise with NULL retention column = skip (no cleanup)

  const retentionCol = workspace[retentionColumn]

  const enterpriseWorkspaceRows = await db
    .select({
      id: workspace.id,
      retentionHours: retentionCol,
    })
    .from(workspace)
    .innerJoin(
      subscription,
      and(
        eq(subscription.referenceId, workspace.billedAccountUserId),
        inArray(subscription.status, ENTITLED_SUBSCRIPTION_STATUSES),
        eq(subscription.plan, 'enterprise')
      )
    )
    .where(and(isNull(workspace.archivedAt), isNotNull(retentionCol)))

  // Group by retention hours to batch workspaces with same retention
  const enterpriseGroups = new Map<number, string[]>()
  for (const ws of enterpriseWorkspaceRows) {
    const hours = ws.retentionHours as number
    const group = enterpriseGroups.get(hours) ?? []
    group.push(ws.id)
    enterpriseGroups.set(hours, group)
  }

  logger.info(
    `[enterprise] Found ${enterpriseWorkspaceRows.length} workspaces with custom retention (${enterpriseGroups.size} distinct periods). Workspaces with NULL are skipped.`
  )

  for (const [hours, ids] of enterpriseGroups) {
    const retentionDate = new Date(now - hours * 60 * 60 * 1000)
    groups.push({
      workspaceIds: ids,
      retentionDate,
      tierLabel: `enterprise-${hours}h`,
    })
    logger.info(
      `[enterprise-${hours}h] ${ids.length} workspaces, retention cutoff: ${retentionDate.toISOString()}`
    )
  }

  return groups
}

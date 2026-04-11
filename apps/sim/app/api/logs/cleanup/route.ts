import { db } from '@sim/db'
import { subscription, workflowExecutionLogs, workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/internal'
import { sqlIsPaid, sqlIsPro, sqlIsTeam } from '@/lib/billing/plan-helpers'
import { ENTITLED_SUBSCRIPTION_STATUSES } from '@/lib/billing/subscriptions/utils'
import { env } from '@/lib/core/config/env'
import { snapshotService } from '@/lib/logs/execution/snapshot/service'
import { isUsingCloudStorage, StorageService } from '@/lib/uploads'

export const dynamic = 'force-dynamic'

const logger = createLogger('LogsCleanupAPI')

const BATCH_SIZE = 2000
const MAX_BATCHES_PER_TIER = 10

interface TierResults {
  total: number
  deleted: number
  deleteFailed: number
  filesTotal: number
  filesDeleted: number
  filesDeleteFailed: number
}

function emptyTierResults(): TierResults {
  return { total: 0, deleted: 0, deleteFailed: 0, filesTotal: 0, filesDeleted: 0, filesDeleteFailed: 0 }
}

async function deleteExecutionFiles(
  files: unknown,
  results: TierResults
): Promise<void> {
  if (!isUsingCloudStorage() || !files || !Array.isArray(files)) return

  for (const file of files) {
    if (!file || typeof file !== 'object' || !file.key) continue
    results.filesTotal++
    try {
      await StorageService.deleteFile({ key: file.key, context: 'execution' })
      const { deleteFileMetadata } = await import('@/lib/uploads/server/metadata')
      await deleteFileMetadata(file.key)
      results.filesDeleted++
    } catch (fileError) {
      results.filesDeleteFailed++
      logger.error(`Failed to delete file ${file.key}:`, { fileError })
    }
  }
}

/**
 * Run batch cleanup for a set of workspace IDs with a given retention date.
 * Selects logs to find files, deletes files from storage, then deletes log rows.
 */
async function cleanupTier(
  workspaceIds: string[],
  retentionDate: Date,
  tierLabel: string
): Promise<TierResults> {
  const results = emptyTierResults()

  if (workspaceIds.length === 0) return results

  let batchesProcessed = 0
  let hasMore = true

  while (hasMore && batchesProcessed < MAX_BATCHES_PER_TIER) {
    // Select logs with files before deleting so we can clean up storage
    const batch = await db
      .select({
        id: workflowExecutionLogs.id,
        files: workflowExecutionLogs.files,
      })
      .from(workflowExecutionLogs)
      .where(
        and(
          inArray(workflowExecutionLogs.workspaceId, workspaceIds),
          lt(workflowExecutionLogs.startedAt, retentionDate)
        )
      )
      .limit(BATCH_SIZE)

    results.total += batch.length

    if (batch.length === 0) {
      hasMore = false
      break
    }

    // Delete associated files from cloud storage
    for (const log of batch) {
      await deleteExecutionFiles(log.files, results)
    }

    // Batch delete the log rows
    const logIds = batch.map((log) => log.id)
    try {
      const deleted = await db
        .delete(workflowExecutionLogs)
        .where(inArray(workflowExecutionLogs.id, logIds))
        .returning({ id: workflowExecutionLogs.id })

      results.deleted += deleted.length
    } catch (deleteError) {
      results.deleteFailed += logIds.length
      logger.error(`Batch delete failed for ${tierLabel}:`, { deleteError })
    }

    batchesProcessed++
    hasMore = batch.length === BATCH_SIZE

    logger.info(
      `[${tierLabel}] Batch ${batchesProcessed}: ${batch.length} logs processed`
    )
  }

  return results
}

async function runLogCleanup() {
  const startTime = Date.now()

  const freeRetentionDays = Number(env.FREE_PLAN_LOG_RETENTION_DAYS || '7')
  const paidRetentionDays = Number(env.PAID_PLAN_LOG_RETENTION_DAYS || '30')

  const freeRetentionDate = new Date(Date.now() - freeRetentionDays * 24 * 60 * 60 * 1000)
  const paidRetentionDate = new Date(Date.now() - paidRetentionDays * 24 * 60 * 60 * 1000)

  logger.info('Starting log cleanup', {
    freeRetentionDays,
    paidRetentionDays,
    freeRetentionDate: freeRetentionDate.toISOString(),
    paidRetentionDate: paidRetentionDate.toISOString(),
  })

  // --- Group 1: Free workspaces (no paid subscription) ---

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
  logger.info(`[free] Found ${freeIds.length} workspaces, retention cutoff: ${freeRetentionDate.toISOString()}`)
  const freeResults = await cleanupTier(freeIds, freeRetentionDate, 'free')
  logger.info(`[free] Result: ${freeResults.deleted} deleted, ${freeResults.deleteFailed} failed out of ${freeResults.total} candidates`)

  // --- Group 2: Pro/Team workspaces (paid non-enterprise) ---

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
  logger.info(`[paid] Found ${paidIds.length} workspaces, retention cutoff: ${paidRetentionDate.toISOString()}`)
  const paidResults = await cleanupTier(paidIds, paidRetentionDate, 'paid')
  logger.info(`[paid] Result: ${paidResults.deleted} deleted, ${paidResults.deleteFailed} failed out of ${paidResults.total} candidates`)

  // --- Group 3: Enterprise with custom logRetentionHours ---
  // Enterprise with logRetentionHours = NULL → no cleanup (infinite retention)

  const enterpriseWorkspaceRows = await db
    .select({
      id: workspace.id,
      logRetentionHours: workspace.logRetentionHours,
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
    .where(
      and(isNull(workspace.archivedAt), isNotNull(workspace.logRetentionHours))
    )

  const enterpriseGroups = new Map<number, string[]>()
  for (const ws of enterpriseWorkspaceRows) {
    const hours = ws.logRetentionHours!
    const group = enterpriseGroups.get(hours) ?? []
    group.push(ws.id)
    enterpriseGroups.set(hours, group)
  }

  logger.info(`[enterprise] Found ${enterpriseWorkspaceRows.length} workspaces with custom retention (${enterpriseGroups.size} distinct retention periods). Workspaces with NULL retention are skipped.`)

  const enterpriseResults = emptyTierResults()
  for (const [hours, ids] of enterpriseGroups) {
    const retentionDate = new Date(Date.now() - hours * 60 * 60 * 1000)
    logger.info(`[enterprise-${hours}h] Processing ${ids.length} workspaces, retention cutoff: ${retentionDate.toISOString()}`)
    const groupResults = await cleanupTier(ids, retentionDate, `enterprise-${hours}h`)
    enterpriseResults.total += groupResults.total
    enterpriseResults.deleted += groupResults.deleted
    enterpriseResults.deleteFailed += groupResults.deleteFailed
    enterpriseResults.filesTotal += groupResults.filesTotal
    enterpriseResults.filesDeleted += groupResults.filesDeleted
    enterpriseResults.filesDeleteFailed += groupResults.filesDeleteFailed
  }

  // --- Snapshot cleanup ---

  try {
    const allRetentionDays = [freeRetentionDays, paidRetentionDays]
    for (const hours of enterpriseGroups.keys()) {
      allRetentionDays.push(hours / 24)
    }
    const shortestRetentionDays = Math.min(...allRetentionDays)
    const snapshotsCleaned = await snapshotService.cleanupOrphanedSnapshots(
      shortestRetentionDays + 1
    )
    logger.info(`Cleaned up ${snapshotsCleaned} orphaned snapshots`)
  } catch (snapshotError) {
    logger.error('Error cleaning up orphaned snapshots:', { snapshotError })
  }

  const timeElapsed = (Date.now() - startTime) / 1000
  logger.info(`Log cleanup completed in ${timeElapsed.toFixed(2)}s`, {
    free: { workspaces: freeIds.length, ...freeResults },
    paid: { workspaces: paidIds.length, ...paidResults },
    enterprise: { workspaces: enterpriseWorkspaceRows.length, groups: enterpriseGroups.size, ...enterpriseResults },
  })
}

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request, 'logs cleanup')
    if (authError) return authError

    await runLogCleanup()

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error in log cleanup process:', { error })
    return NextResponse.json({ error: 'Failed to process log cleanup' }, { status: 500 })
  }
}

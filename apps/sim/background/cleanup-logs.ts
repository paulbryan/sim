import { db } from '@sim/db'
import { workflowExecutionLogs } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { task } from '@trigger.dev/sdk'
import { and, inArray, lt } from 'drizzle-orm'
import { snapshotService } from '@/lib/logs/execution/snapshot/service'
import { resolveRetentionGroups } from '@/lib/retention/workspace-tiers'
import { isUsingCloudStorage, StorageService } from '@/lib/uploads'

const logger = createLogger('CleanupLogs')

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

async function deleteExecutionFiles(files: unknown, results: TierResults): Promise<void> {
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

    for (const log of batch) {
      await deleteExecutionFiles(log.files, results)
    }

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

    logger.info(`[${tierLabel}] Batch ${batchesProcessed}: ${batch.length} logs processed`)
  }

  return results
}

export const cleanupLogsTask = task({
  id: 'cleanup-logs',
  run: async () => {
    const startTime = Date.now()

    logger.info('Starting log cleanup task')

    const groups = await resolveRetentionGroups('logRetentionHours')

    for (const group of groups) {
      const results = await cleanupTier(group.workspaceIds, group.retentionDate, group.tierLabel)
      logger.info(`[${group.tierLabel}] Result: ${results.deleted} deleted, ${results.deleteFailed} failed out of ${results.total} candidates`)
    }

    // Snapshot cleanup — use shortest retention + 1 day
    try {
      const shortestDays = Math.min(
        ...groups.map((g) => (Date.now() - g.retentionDate.getTime()) / (24 * 60 * 60 * 1000))
      )
      if (Number.isFinite(shortestDays)) {
        const snapshotsCleaned = await snapshotService.cleanupOrphanedSnapshots(
          Math.floor(shortestDays) + 1
        )
        logger.info(`Cleaned up ${snapshotsCleaned} orphaned snapshots`)
      }
    } catch (snapshotError) {
      logger.error('Error cleaning up orphaned snapshots:', { snapshotError })
    }

    const timeElapsed = (Date.now() - startTime) / 1000
    logger.info(`Log cleanup task completed in ${timeElapsed.toFixed(2)}s`)
  },
})

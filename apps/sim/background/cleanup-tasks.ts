import { db } from '@sim/db'
import {
  copilotAsyncToolCalls,
  copilotChats,
  copilotFeedback,
  copilotRunCheckpoints,
  copilotRuns,
  mothershipInboxTask,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { task } from '@trigger.dev/sdk'
import { and, inArray, lt, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import { resolveRetentionGroups } from '@/lib/retention/workspace-tiers'

const logger = createLogger('CleanupTasks')

const BATCH_SIZE = 2000
const MAX_BATCHES_PER_TABLE = 10

interface TableCleanupResult {
  table: string
  deleted: number
  failed: number
}

async function cleanupTable(
  tableDef: PgTable,
  workspaceIdCol: PgColumn,
  createdAtCol: PgColumn,
  workspaceIds: string[],
  retentionDate: Date,
  tableName: string
): Promise<TableCleanupResult> {
  const result: TableCleanupResult = { table: tableName, deleted: 0, failed: 0 }
  if (workspaceIds.length === 0) return result

  let batchesProcessed = 0
  let hasMore = true

  while (hasMore && batchesProcessed < MAX_BATCHES_PER_TABLE) {
    try {
      const deleted = await db
        .delete(tableDef)
        .where(and(inArray(workspaceIdCol, workspaceIds), lt(createdAtCol, retentionDate)))
        .returning({ id: sql`id` })

      result.deleted += deleted.length
      hasMore = deleted.length === BATCH_SIZE
      batchesProcessed++

      if (deleted.length > 0) {
        logger.info(`[${tableName}] Batch ${batchesProcessed}: deleted ${deleted.length} rows`)
      } else {
        logger.info(`[${tableName}] No expired rows found`)
      }
    } catch (error) {
      result.failed++
      logger.error(`[${tableName}] Batch delete failed:`, { error })
      hasMore = false
    }
  }

  return result
}

/**
 * Delete copilot run checkpoints and async tool calls via join through copilotRuns.
 * These tables don't have a direct workspaceId — we find qualifying run IDs first.
 */
async function cleanupRunChildren(
  workspaceIds: string[],
  retentionDate: Date,
  tierLabel: string
): Promise<TableCleanupResult[]> {
  const results: TableCleanupResult[] = []
  if (workspaceIds.length === 0) return results

  // Find run IDs in scope
  const runIds = await db
    .select({ id: copilotRuns.id })
    .from(copilotRuns)
    .where(and(inArray(copilotRuns.workspaceId, workspaceIds), lt(copilotRuns.createdAt, retentionDate)))
    .limit(BATCH_SIZE * MAX_BATCHES_PER_TABLE)

  if (runIds.length === 0) {
    results.push({ table: `${tierLabel}/copilotRunCheckpoints`, deleted: 0, failed: 0 })
    results.push({ table: `${tierLabel}/copilotAsyncToolCalls`, deleted: 0, failed: 0 })
    return results
  }

  const ids = runIds.map((r) => r.id)

  // Delete checkpoints
  const checkpointResult: TableCleanupResult = {
    table: `${tierLabel}/copilotRunCheckpoints`,
    deleted: 0,
    failed: 0,
  }
  try {
    const deleted = await db
      .delete(copilotRunCheckpoints)
      .where(inArray(copilotRunCheckpoints.runId, ids))
      .returning({ id: sql`id` })
    checkpointResult.deleted = deleted.length
    logger.info(`[${tierLabel}/copilotRunCheckpoints] Deleted ${deleted.length} rows`)
  } catch (error) {
    checkpointResult.failed++
    logger.error(`[${tierLabel}/copilotRunCheckpoints] Delete failed:`, { error })
  }
  results.push(checkpointResult)

  // Delete async tool calls
  const toolCallResult: TableCleanupResult = {
    table: `${tierLabel}/copilotAsyncToolCalls`,
    deleted: 0,
    failed: 0,
  }
  try {
    const deleted = await db
      .delete(copilotAsyncToolCalls)
      .where(inArray(copilotAsyncToolCalls.runId, ids))
      .returning({ id: sql`id` })
    toolCallResult.deleted = deleted.length
    logger.info(`[${tierLabel}/copilotAsyncToolCalls] Deleted ${deleted.length} rows`)
  } catch (error) {
    toolCallResult.failed++
    logger.error(`[${tierLabel}/copilotAsyncToolCalls] Delete failed:`, { error })
  }
  results.push(toolCallResult)

  return results
}

export const cleanupTasksTask = task({
  id: 'cleanup-tasks',
  run: async () => {
    const startTime = Date.now()

    logger.info('Starting task cleanup')

    const groups = await resolveRetentionGroups('taskCleanupHours')

    for (const group of groups) {
      logger.info(
        `[${group.tierLabel}] Processing ${group.workspaceIds.length} workspaces`
      )

      // Delete run children first (checkpoints, tool calls) since they reference runs
      const runChildResults = await cleanupRunChildren(
        group.workspaceIds,
        group.retentionDate,
        group.tierLabel
      )
      for (const r of runChildResults) {
        if (r.deleted > 0) logger.info(`[${r.table}] ${r.deleted} deleted`)
      }

      // Delete feedback — no direct workspaceId, find via copilotChats
      const feedbackResult: TableCleanupResult = {
        table: `${group.tierLabel}/copilotFeedback`,
        deleted: 0,
        failed: 0,
      }
      try {
        const chatIds = await db
          .select({ id: copilotChats.id })
          .from(copilotChats)
          .where(
            and(
              inArray(copilotChats.workspaceId, group.workspaceIds),
              lt(copilotChats.createdAt, group.retentionDate)
            )
          )
          .limit(BATCH_SIZE * MAX_BATCHES_PER_TABLE)

        if (chatIds.length > 0) {
          const deleted = await db
            .delete(copilotFeedback)
            .where(inArray(copilotFeedback.chatId, chatIds.map((c) => c.id)))
            .returning({ id: sql`id` })
          feedbackResult.deleted = deleted.length
          logger.info(`[${feedbackResult.table}] Deleted ${deleted.length} rows`)
        } else {
          logger.info(`[${feedbackResult.table}] No expired rows found`)
        }
      } catch (error) {
        feedbackResult.failed++
        logger.error(`[${feedbackResult.table}] Delete failed:`, { error })
      }

      // Delete copilot runs (has workspaceId directly, cascades checkpoints)
      const runsResult = await cleanupTable(
        copilotRuns,
        copilotRuns.workspaceId,
        copilotRuns.createdAt,
        group.workspaceIds,
        group.retentionDate,
        `${group.tierLabel}/copilotRuns`
      )

      // Delete copilot chats (has workspaceId directly)
      const chatsResult = await cleanupTable(
        copilotChats,
        copilotChats.workspaceId,
        copilotChats.createdAt,
        group.workspaceIds,
        group.retentionDate,
        `${group.tierLabel}/copilotChats`
      )

      // Delete mothership inbox tasks (has workspaceId directly)
      const inboxResult = await cleanupTable(
        mothershipInboxTask,
        mothershipInboxTask.workspaceId,
        mothershipInboxTask.createdAt,
        group.workspaceIds,
        group.retentionDate,
        `${group.tierLabel}/mothershipInboxTask`
      )

      const totalDeleted =
        runChildResults.reduce((s, r) => s + r.deleted, 0) +
        runsResult.deleted +
        chatsResult.deleted +
        inboxResult.deleted

      logger.info(`[${group.tierLabel}] Complete: ${totalDeleted} total rows deleted`)
    }

    const timeElapsed = (Date.now() - startTime) / 1000
    logger.info(`Task cleanup completed in ${timeElapsed.toFixed(2)}s`)
  },
})

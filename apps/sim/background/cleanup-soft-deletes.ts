import { db } from '@sim/db'
import {
  a2aAgent,
  knowledgeBase,
  mcpServers,
  memory,
  userTableDefinitions,
  workflow,
  workflowFolder,
  workflowMcpServer,
  workspaceFile,
  workspaceFiles,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { task } from '@trigger.dev/sdk'
import { and, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import { resolveRetentionGroups } from '@/lib/retention/workspace-tiers'
import { isUsingCloudStorage, StorageService } from '@/lib/uploads'

const logger = createLogger('CleanupSoftDeletes')

const BATCH_SIZE = 2000
const MAX_BATCHES_PER_TABLE = 10

interface TableCleanupResult {
  table: string
  deleted: number
  failed: number
}

async function cleanupTable(
  tableDef: PgTable,
  softDeleteCol: PgColumn,
  workspaceIdCol: PgColumn,
  workspaceIds: string[],
  retentionDate: Date,
  tableName: string
): Promise<TableCleanupResult> {
  const result: TableCleanupResult = { table: tableName, deleted: 0, failed: 0 }

  if (workspaceIds.length === 0) {
    logger.info(`[${tableName}] Skipped — no workspaces in this tier`)
    return result
  }

  let batchesProcessed = 0
  let hasMore = true

  while (hasMore && batchesProcessed < MAX_BATCHES_PER_TABLE) {
    try {
      const deleted = await db
        .delete(tableDef)
        .where(
          and(
            inArray(workspaceIdCol, workspaceIds),
            isNotNull(softDeleteCol),
            lt(softDeleteCol, retentionDate)
          )
        )
        .returning({ id: sql`id` })

      result.deleted += deleted.length
      hasMore = deleted.length === BATCH_SIZE
      batchesProcessed++

      if (deleted.length > 0) {
        logger.info(`[${tableName}] Batch ${batchesProcessed}: deleted ${deleted.length} rows`)
      } else {
        logger.info(`[${tableName}] No expired soft-deleted rows found`)
      }
    } catch (error) {
      result.failed++
      logger.error(`[${tableName}] Batch delete failed:`, { error })
      hasMore = false
    }
  }

  return result
}

async function cleanupWorkspaceFileStorage(
  workspaceIds: string[],
  retentionDate: Date
): Promise<{ filesDeleted: number; filesFailed: number }> {
  const stats = { filesDeleted: 0, filesFailed: 0 }

  if (!isUsingCloudStorage() || workspaceIds.length === 0) return stats

  const filesToDelete = await db
    .select({ key: workspaceFiles.key })
    .from(workspaceFiles)
    .where(
      and(
        inArray(workspaceFiles.workspaceId, workspaceIds),
        isNotNull(workspaceFiles.deletedAt),
        lt(workspaceFiles.deletedAt, retentionDate)
      )
    )
    .limit(BATCH_SIZE * MAX_BATCHES_PER_TABLE)

  for (const file of filesToDelete) {
    try {
      await StorageService.deleteFile({ key: file.key, context: 'workspace' })
      stats.filesDeleted++
    } catch (error) {
      stats.filesFailed++
      logger.error(`Failed to delete storage file ${file.key}:`, { error })
    }
  }

  return stats
}

const CLEANUP_TARGETS = [
  { table: workflow, softDeleteCol: workflow.archivedAt, wsCol: workflow.workspaceId, name: 'workflow' },
  { table: workflowFolder, softDeleteCol: workflowFolder.archivedAt, wsCol: workflowFolder.workspaceId, name: 'workflowFolder' },
  { table: knowledgeBase, softDeleteCol: knowledgeBase.deletedAt, wsCol: knowledgeBase.workspaceId, name: 'knowledgeBase' },
  { table: userTableDefinitions, softDeleteCol: userTableDefinitions.archivedAt, wsCol: userTableDefinitions.workspaceId, name: 'userTableDefinitions' },
  { table: workspaceFile, softDeleteCol: workspaceFile.deletedAt, wsCol: workspaceFile.workspaceId, name: 'workspaceFile' },
  { table: workspaceFiles, softDeleteCol: workspaceFiles.deletedAt, wsCol: workspaceFiles.workspaceId, name: 'workspaceFiles' },
  { table: memory, softDeleteCol: memory.deletedAt, wsCol: memory.workspaceId, name: 'memory' },
  { table: mcpServers, softDeleteCol: mcpServers.deletedAt, wsCol: mcpServers.workspaceId, name: 'mcpServers' },
  { table: workflowMcpServer, softDeleteCol: workflowMcpServer.deletedAt, wsCol: workflowMcpServer.workspaceId, name: 'workflowMcpServer' },
  { table: a2aAgent, softDeleteCol: a2aAgent.archivedAt, wsCol: a2aAgent.workspaceId, name: 'a2aAgent' },
] as const

export const cleanupSoftDeletesTask = task({
  id: 'cleanup-soft-deletes',
  run: async () => {
    const startTime = Date.now()

    logger.info('Starting soft-delete cleanup task')

    const groups = await resolveRetentionGroups('softDeleteRetentionHours')

    for (const group of groups) {
      logger.info(
        `[${group.tierLabel}] Processing ${group.workspaceIds.length} workspaces`
      )

      const fileStats = await cleanupWorkspaceFileStorage(
        group.workspaceIds,
        group.retentionDate
      )

      let totalDeleted = 0
      for (const target of CLEANUP_TARGETS) {
        const result = await cleanupTable(
          target.table,
          target.softDeleteCol,
          target.wsCol,
          group.workspaceIds,
          group.retentionDate,
          `${group.tierLabel}/${target.name}`
        )
        totalDeleted += result.deleted
      }

      logger.info(
        `[${group.tierLabel}] Complete: ${totalDeleted} rows deleted, ${fileStats.filesDeleted} files cleaned`
      )
    }

    const timeElapsed = (Date.now() - startTime) / 1000
    logger.info(`Soft-delete cleanup task completed in ${timeElapsed.toFixed(2)}s`)
  },
})

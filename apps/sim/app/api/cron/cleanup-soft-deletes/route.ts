import { db } from '@sim/db'
import {
  a2aAgent,
  knowledgeBase,
  mcpServers,
  memory,
  subscription,
  userTableDefinitions,
  workflow,
  workflowFolder,
  workflowMcpServer,
  workspace,
  workspaceFile,
  workspaceFiles,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/internal'
import { sqlIsPaid, sqlIsPro, sqlIsTeam } from '@/lib/billing/plan-helpers'
import { ENTITLED_SUBSCRIPTION_STATUSES } from '@/lib/billing/subscriptions/utils'
import { env } from '@/lib/core/config/env'
import { isUsingCloudStorage, StorageService } from '@/lib/uploads'

export const dynamic = 'force-dynamic'

const logger = createLogger('SoftDeleteCleanupAPI')

const BATCH_SIZE = 2000
const MAX_BATCHES_PER_TABLE = 10

interface TableCleanupResult {
  table: string
  deleted: number
  failed: number
}

/**
 * Batch-delete rows from a table where the soft-delete column is older than the retention date,
 * scoped to the given workspace IDs.
 */
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

/**
 * Clean up soft-deleted workspace files from cloud storage before hard-deleting.
 */
async function cleanupWorkspaceFileStorage(
  workspaceIds: string[],
  retentionDate: Date
): Promise<{ filesDeleted: number; filesFailed: number }> {
  const stats = { filesDeleted: 0, filesFailed: 0 }

  if (!isUsingCloudStorage() || workspaceIds.length === 0) return stats

  // Fetch keys of files about to be deleted
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

/** All tables to clean up with their soft-delete column and workspace column. */
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

async function cleanupTier(
  workspaceIds: string[],
  retentionDate: Date,
  tierLabel: string
): Promise<{ tables: TableCleanupResult[]; filesDeleted: number; filesFailed: number }> {
  const tables: TableCleanupResult[] = []

  if (workspaceIds.length === 0) {
    return { tables, filesDeleted: 0, filesFailed: 0 }
  }

  // Clean cloud storage files before hard-deleting file metadata rows
  const fileStats = await cleanupWorkspaceFileStorage(workspaceIds, retentionDate)

  for (const target of CLEANUP_TARGETS) {
    const result = await cleanupTable(
      target.table,
      target.softDeleteCol,
      target.wsCol,
      workspaceIds,
      retentionDate,
      `${tierLabel}/${target.name}`
    )
    tables.push(result)
  }

  return { tables, ...fileStats }
}

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request, 'soft-delete cleanup')
    if (authError) return authError

    const startTime = Date.now()

    const freeRetentionDays = Number(env.FREE_PLAN_LOG_RETENTION_DAYS || '7')
    const paidRetentionDays = Number(env.PAID_PLAN_LOG_RETENTION_DAYS || '30')

    const freeRetentionDate = new Date(Date.now() - freeRetentionDays * 24 * 60 * 60 * 1000)
    const paidRetentionDate = new Date(Date.now() - paidRetentionDays * 24 * 60 * 60 * 1000)

    logger.info('Starting soft-delete cleanup', {
      freeRetentionDays,
      paidRetentionDays,
      freeRetentionDate: freeRetentionDate.toISOString(),
      paidRetentionDate: paidRetentionDate.toISOString(),
    })

    // --- Group 1: Free workspaces ---

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
    logger.info(`[free] Result: ${freeResults.tables.reduce((s, t) => s + t.deleted, 0)} total rows deleted across ${CLEANUP_TARGETS.length} tables`)

    // --- Group 2: Pro/Team workspaces ---

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
    logger.info(`[paid] Result: ${paidResults.tables.reduce((s, t) => s + t.deleted, 0)} total rows deleted across ${CLEANUP_TARGETS.length} tables`)

    // --- Group 3: Enterprise with custom softDeleteRetentionHours ---

    const enterpriseWorkspaceRows = await db
      .select({
        id: workspace.id,
        softDeleteRetentionHours: workspace.softDeleteRetentionHours,
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
        and(isNull(workspace.archivedAt), isNotNull(workspace.softDeleteRetentionHours))
      )

    const enterpriseGroups = new Map<number, string[]>()
    for (const ws of enterpriseWorkspaceRows) {
      const hours = ws.softDeleteRetentionHours!
      const group = enterpriseGroups.get(hours) ?? []
      group.push(ws.id)
      enterpriseGroups.set(hours, group)
    }

    logger.info(`[enterprise] Found ${enterpriseWorkspaceRows.length} workspaces with custom retention (${enterpriseGroups.size} distinct retention periods). Workspaces with NULL retention are skipped.`)

    const enterpriseTables: TableCleanupResult[] = []
    let enterpriseFilesDeleted = 0
    let enterpriseFilesFailed = 0

    for (const [hours, ids] of enterpriseGroups) {
      const retentionDate = new Date(Date.now() - hours * 60 * 60 * 1000)
      logger.info(`[enterprise-${hours}h] Processing ${ids.length} workspaces, retention cutoff: ${retentionDate.toISOString()}`)
      const groupResults = await cleanupTier(ids, retentionDate, `enterprise-${hours}h`)
      enterpriseTables.push(...groupResults.tables)
      enterpriseFilesDeleted += groupResults.filesDeleted
      enterpriseFilesFailed += groupResults.filesFailed
    }

    const timeElapsed = (Date.now() - startTime) / 1000

    const totalDeleted = (results: { tables: TableCleanupResult[] }) =>
      results.tables.reduce((sum, t) => sum + t.deleted, 0)

    return NextResponse.json({
      message: `Soft-delete cleanup completed in ${timeElapsed.toFixed(2)}s`,
      tiers: {
        free: {
          workspaces: freeIds.length,
          retentionDays: freeRetentionDays,
          totalDeleted: totalDeleted(freeResults),
          filesDeleted: freeResults.filesDeleted,
          filesFailed: freeResults.filesFailed,
          tables: freeResults.tables,
        },
        paid: {
          workspaces: paidIds.length,
          retentionDays: paidRetentionDays,
          totalDeleted: totalDeleted(paidResults),
          filesDeleted: paidResults.filesDeleted,
          filesFailed: paidResults.filesFailed,
          tables: paidResults.tables,
        },
        enterprise: {
          workspaces: enterpriseWorkspaceRows.length,
          groups: enterpriseGroups.size,
          totalDeleted: enterpriseTables.reduce((sum, t) => sum + t.deleted, 0),
          filesDeleted: enterpriseFilesDeleted,
          filesFailed: enterpriseFilesFailed,
          tables: enterpriseTables,
        },
      },
    })
  } catch (error) {
    logger.error('Error in soft-delete cleanup:', { error })
    return NextResponse.json({ error: 'Failed to process soft-delete cleanup' }, { status: 500 })
  }
}

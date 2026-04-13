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
import { and, eq, inArray, isNull, lt } from 'drizzle-orm'
import {
  SUPPORTED_PII_ENTITIES,
  validatePII,
} from '@/lib/guardrails/validate_pii'
import { resolveRetentionGroups } from '@/lib/retention/workspace-tiers'

const logger = createLogger('RedactTaskContext')

const BATCH_SIZE = 100
const ALL_ENTITY_TYPES = Object.keys(SUPPORTED_PII_ENTITIES)

async function maskText(text: string | null, requestId: string): Promise<string | null> {
  if (!text || text.length === 0) return null

  const result = await validatePII({
    text,
    entityTypes: ALL_ENTITY_TYPES,
    mode: 'mask',
    language: 'en',
    requestId,
  })

  if (result.maskedText && result.detectedEntities.length > 0) {
    return result.maskedText
  }
  return null
}

async function maskJsonb(
  value: unknown,
  requestId: string
): Promise<{ masked: unknown; changed: boolean }> {
  if (typeof value === 'string') {
    const masked = await maskText(value, requestId)
    if (masked !== null) return { masked, changed: true }
    return { masked: value, changed: false }
  }

  if (Array.isArray(value)) {
    let anyChanged = false
    const result = []
    for (let i = 0; i < value.length; i++) {
      const { masked, changed } = await maskJsonb(value[i], `${requestId}-${i}`)
      result.push(masked)
      if (changed) anyChanged = true
    }
    return { masked: result, changed: anyChanged }
  }

  if (value && typeof value === 'object') {
    let anyChanged = false
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      const { masked, changed } = await maskJsonb(val, `${requestId}-${key}`)
      result[key] = masked
      if (changed) anyChanged = true
    }
    return { masked: result, changed: anyChanged }
  }

  return { masked: value, changed: false }
}

interface RedactionStats {
  table: string
  processed: number
  redacted: number
  failed: number
}

function emptyStats(table: string): RedactionStats {
  return { table, processed: 0, redacted: 0, failed: 0 }
}

async function redactCopilotChats(
  workspaceIds: string[],
  retentionDate: Date
): Promise<RedactionStats> {
  const stats = emptyStats('copilotChats')
  if (workspaceIds.length === 0) return stats

  const rows = await db
    .select({ id: copilotChats.id, messages: copilotChats.messages })
    .from(copilotChats)
    .where(
      and(
        inArray(copilotChats.workspaceId, workspaceIds),
        isNull(copilotChats.redactedAt),
        lt(copilotChats.createdAt, retentionDate)
      )
    )
    .limit(BATCH_SIZE)

  for (const row of rows) {
    stats.processed++
    try {
      const { masked, changed } = await maskJsonb(row.messages, `chat-${row.id}`)
      await db
        .update(copilotChats)
        .set({ messages: changed ? masked : row.messages, redactedAt: new Date() })
        .where(eq(copilotChats.id, row.id))
      if (changed) stats.redacted++
    } catch (error) {
      stats.failed++
      logger.error(`Failed to redact copilotChat ${row.id}:`, { error })
    }
  }

  return stats
}

async function redactMothershipInboxTasks(
  workspaceIds: string[],
  retentionDate: Date
): Promise<RedactionStats> {
  const stats = emptyStats('mothershipInboxTask')
  if (workspaceIds.length === 0) return stats

  const rows = await db
    .select({
      id: mothershipInboxTask.id,
      fromEmail: mothershipInboxTask.fromEmail,
      fromName: mothershipInboxTask.fromName,
      subject: mothershipInboxTask.subject,
      bodyPreview: mothershipInboxTask.bodyPreview,
      bodyText: mothershipInboxTask.bodyText,
      bodyHtml: mothershipInboxTask.bodyHtml,
      ccRecipients: mothershipInboxTask.ccRecipients,
    })
    .from(mothershipInboxTask)
    .where(
      and(
        inArray(mothershipInboxTask.workspaceId, workspaceIds),
        isNull(mothershipInboxTask.redactedAt),
        lt(mothershipInboxTask.createdAt, retentionDate)
      )
    )
    .limit(BATCH_SIZE)

  for (const row of rows) {
    stats.processed++
    try {
      const rid = `inbox-${row.id}`
      const [mFromEmail, mFromName, mSubject, mBodyPreview, mBodyText, mBodyHtml, mCc] =
        await Promise.all([
          maskText(row.fromEmail, `${rid}-fromEmail`),
          maskText(row.fromName, `${rid}-fromName`),
          maskText(row.subject, `${rid}-subject`),
          maskText(row.bodyPreview, `${rid}-bodyPreview`),
          maskText(row.bodyText, `${rid}-bodyText`),
          maskText(row.bodyHtml, `${rid}-bodyHtml`),
          maskText(row.ccRecipients, `${rid}-ccRecipients`),
        ])

      const hasChanges =
        mFromEmail !== null ||
        mFromName !== null ||
        mSubject !== null ||
        mBodyPreview !== null ||
        mBodyText !== null ||
        mBodyHtml !== null ||
        mCc !== null

      const updateData: Record<string, unknown> = { redactedAt: new Date() }
      if (mFromEmail !== null) updateData.fromEmail = mFromEmail
      if (mFromName !== null) updateData.fromName = mFromName
      if (mSubject !== null) updateData.subject = mSubject
      if (mBodyPreview !== null) updateData.bodyPreview = mBodyPreview
      if (mBodyText !== null) updateData.bodyText = mBodyText
      if (mBodyHtml !== null) updateData.bodyHtml = mBodyHtml
      if (mCc !== null) updateData.ccRecipients = mCc

      await db
        .update(mothershipInboxTask)
        .set(updateData)
        .where(eq(mothershipInboxTask.id, row.id))

      if (hasChanges) stats.redacted++
    } catch (error) {
      stats.failed++
      logger.error(`Failed to redact mothershipInboxTask ${row.id}:`, { error })
    }
  }

  return stats
}

async function redactCopilotFeedback(
  workspaceIds: string[],
  retentionDate: Date
): Promise<RedactionStats> {
  const stats = emptyStats('copilotFeedback')
  if (workspaceIds.length === 0) return stats

  const rows = await db
    .select({
      id: copilotFeedback.feedbackId,
      userQuery: copilotFeedback.userQuery,
      agentResponse: copilotFeedback.agentResponse,
      feedback: copilotFeedback.feedback,
    })
    .from(copilotFeedback)
    .innerJoin(copilotChats, eq(copilotFeedback.chatId, copilotChats.id))
    .where(
      and(
        inArray(copilotChats.workspaceId, workspaceIds),
        isNull(copilotFeedback.redactedAt),
        lt(copilotFeedback.createdAt, retentionDate)
      )
    )
    .limit(BATCH_SIZE)

  for (const row of rows) {
    stats.processed++
    try {
      const rid = `feedback-${row.id}`
      const [mQuery, mResponse, mFeedback] = await Promise.all([
        maskText(row.userQuery, `${rid}-query`),
        maskText(row.agentResponse, `${rid}-response`),
        maskText(row.feedback, `${rid}-feedback`),
      ])

      const hasChanges = mQuery !== null || mResponse !== null || mFeedback !== null
      const updateData: Record<string, unknown> = { redactedAt: new Date() }
      if (mQuery !== null) updateData.userQuery = mQuery
      if (mResponse !== null) updateData.agentResponse = mResponse
      if (mFeedback !== null) updateData.feedback = mFeedback

      await db
        .update(copilotFeedback)
        .set(updateData)
        .where(eq(copilotFeedback.feedbackId, row.id))

      if (hasChanges) stats.redacted++
    } catch (error) {
      stats.failed++
      logger.error(`Failed to redact copilotFeedback ${row.id}:`, { error })
    }
  }

  return stats
}

async function redactCopilotRunCheckpoints(
  workspaceIds: string[],
  retentionDate: Date
): Promise<RedactionStats> {
  const stats = emptyStats('copilotRunCheckpoints')
  if (workspaceIds.length === 0) return stats

  const rows = await db
    .select({
      id: copilotRunCheckpoints.id,
      conversationSnapshot: copilotRunCheckpoints.conversationSnapshot,
    })
    .from(copilotRunCheckpoints)
    .innerJoin(copilotRuns, eq(copilotRunCheckpoints.runId, copilotRuns.id))
    .where(
      and(
        inArray(copilotRuns.workspaceId, workspaceIds),
        isNull(copilotRunCheckpoints.redactedAt),
        lt(copilotRunCheckpoints.createdAt, retentionDate)
      )
    )
    .limit(BATCH_SIZE)

  for (const row of rows) {
    stats.processed++
    try {
      const { masked, changed } = await maskJsonb(row.conversationSnapshot, `checkpoint-${row.id}`)
      await db
        .update(copilotRunCheckpoints)
        .set({
          conversationSnapshot: changed ? masked : row.conversationSnapshot,
          redactedAt: new Date(),
        })
        .where(eq(copilotRunCheckpoints.id, row.id))
      if (changed) stats.redacted++
    } catch (error) {
      stats.failed++
      logger.error(`Failed to redact copilotRunCheckpoint ${row.id}:`, { error })
    }
  }

  return stats
}

async function redactCopilotAsyncToolCalls(
  workspaceIds: string[],
  retentionDate: Date
): Promise<RedactionStats> {
  const stats = emptyStats('copilotAsyncToolCalls')
  if (workspaceIds.length === 0) return stats

  const rows = await db
    .select({
      id: copilotAsyncToolCalls.id,
      args: copilotAsyncToolCalls.args,
      result: copilotAsyncToolCalls.result,
    })
    .from(copilotAsyncToolCalls)
    .innerJoin(copilotRuns, eq(copilotAsyncToolCalls.runId, copilotRuns.id))
    .where(
      and(
        inArray(copilotRuns.workspaceId, workspaceIds),
        isNull(copilotAsyncToolCalls.redactedAt),
        lt(copilotAsyncToolCalls.createdAt, retentionDate)
      )
    )
    .limit(BATCH_SIZE)

  for (const row of rows) {
    stats.processed++
    try {
      const rid = `toolcall-${row.id}`
      const [argsResult, resultResult] = await Promise.all([
        row.args ? maskJsonb(row.args, `${rid}-args`) : { masked: row.args, changed: false },
        row.result ? maskJsonb(row.result, `${rid}-result`) : { masked: row.result, changed: false },
      ])

      const updateData: Record<string, unknown> = { redactedAt: new Date() }
      if (argsResult.changed) updateData.args = argsResult.masked
      if (resultResult.changed) updateData.result = resultResult.masked

      await db
        .update(copilotAsyncToolCalls)
        .set(updateData)
        .where(eq(copilotAsyncToolCalls.id, row.id))

      if (argsResult.changed || resultResult.changed) stats.redacted++
    } catch (error) {
      stats.failed++
      logger.error(`Failed to redact copilotAsyncToolCall ${row.id}:`, { error })
    }
  }

  return stats
}

const REDACTION_FUNCTIONS = [
  redactCopilotChats,
  redactMothershipInboxTasks,
  redactCopilotFeedback,
  redactCopilotRunCheckpoints,
  redactCopilotAsyncToolCalls,
] as const

export const redactTaskContextTask = task({
  id: 'redact-task-context',
  run: async () => {
    const startTime = Date.now()

    logger.info('Starting task context redaction')

    const groups = await resolveRetentionGroups('taskRedactionHours')

    for (const group of groups) {
      logger.info(
        `[${group.tierLabel}] Processing ${group.workspaceIds.length} workspaces`
      )

      for (const redactFn of REDACTION_FUNCTIONS) {
        const stats = await redactFn(group.workspaceIds, group.retentionDate)
        if (stats.processed > 0) {
          logger.info(
            `[${group.tierLabel}/${stats.table}] Processed ${stats.processed}, redacted ${stats.redacted}, failed ${stats.failed}`
          )
        } else {
          logger.info(`[${group.tierLabel}/${stats.table}] No rows to process`)
        }
      }
    }

    const timeElapsed = (Date.now() - startTime) / 1000
    logger.info(`Task context redaction completed in ${timeElapsed.toFixed(2)}s`)
  },
})

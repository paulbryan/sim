import { db } from '@sim/db'
import { workflow, workspaceFiles } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNull } from 'drizzle-orm'
import { importCsvToTable } from '@/app/api/table/import-csv/route'
import type { ExecutionContext, ToolCallResult } from '@/lib/copilot/orchestrator/types'
import {
  createSingleDocument,
  processDocumentAsync,
} from '@/lib/knowledge/documents/service'
import { createKnowledgeBase, getKnowledgeBaseById } from '@/lib/knowledge/service'
import { getServePathPrefix, StorageService } from '@/lib/uploads'
import { downloadWorkspaceFile } from '@/lib/uploads/contexts/workspace/workspace-file-manager'
import { parseWorkflowJson } from '@/lib/workflows/operations/import-export'
import { saveWorkflowToNormalizedTables } from '@/lib/workflows/persistence/utils'
import { deduplicateWorkflowName } from '@/lib/workflows/utils'
import { extractWorkflowMetadata } from '@/app/api/v1/admin/types'

const logger = createLogger('MaterializeFile')

async function findUploadRecord(fileName: string, chatId: string) {
  const rows = await db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.originalName, fileName),
        eq(workspaceFiles.chatId, chatId),
        eq(workspaceFiles.context, 'mothership'),
        isNull(workspaceFiles.deletedAt)
      )
    )
    .limit(1)
  return rows[0] ?? null
}

function toFileRecord(row: typeof workspaceFiles.$inferSelect) {
  const pathPrefix = getServePathPrefix()
  return {
    id: row.id,
    workspaceId: row.workspaceId || '',
    name: row.originalName,
    key: row.key,
    path: `${pathPrefix}${encodeURIComponent(row.key)}?context=mothership`,
    size: row.size,
    type: row.contentType,
    uploadedBy: row.userId,
    deletedAt: row.deletedAt,
    uploadedAt: row.uploadedAt,
  }
}

async function executeSave(fileName: string, chatId: string): Promise<ToolCallResult> {
  const [updated] = await db
    .update(workspaceFiles)
    .set({ context: 'workspace', chatId: null })
    .where(
      and(
        eq(workspaceFiles.originalName, fileName),
        eq(workspaceFiles.chatId, chatId),
        eq(workspaceFiles.context, 'mothership'),
        isNull(workspaceFiles.deletedAt)
      )
    )
    .returning({ id: workspaceFiles.id, originalName: workspaceFiles.originalName })

  if (!updated) {
    return {
      success: false,
      error: `Upload not found: "${fileName}". Use glob("uploads/*") to list available uploads.`,
    }
  }

  logger.info('Materialized file', { fileName, fileId: updated.id, chatId })

  return {
    success: true,
    output: {
      message: `File "${fileName}" materialized. It is now available at files/${fileName} and will persist independently of this chat.`,
      fileId: updated.id,
      path: `files/${fileName}`,
    },
    resources: [{ type: 'file', id: updated.id, title: fileName }],
  }
}

async function executeImport(
  fileName: string,
  chatId: string,
  workspaceId: string,
  userId: string
): Promise<ToolCallResult> {
  const row = await findUploadRecord(fileName, chatId)
  if (!row) {
    return {
      success: false,
      error: `Upload not found: "${fileName}". Use glob("uploads/*") to list available uploads.`,
    }
  }

  const buffer = await downloadWorkspaceFile(toFileRecord(row))
  const content = buffer.toString('utf-8')

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { success: false, error: `"${fileName}" is not valid JSON.` }
  }

  const { data: workflowData, errors } = parseWorkflowJson(content)
  if (!workflowData || errors.length > 0) {
    return {
      success: false,
      error: `Invalid workflow JSON: ${errors.join(', ')}`,
    }
  }

  const {
    name: rawName,
    color: workflowColor,
    description: workflowDescription,
  } = extractWorkflowMetadata(parsed)

  const workflowId = crypto.randomUUID()
  const now = new Date()
  const dedupedName = await deduplicateWorkflowName(rawName, workspaceId, null)

  await db.insert(workflow).values({
    id: workflowId,
    userId,
    workspaceId,
    folderId: null,
    name: dedupedName,
    description: workflowDescription,
    color: workflowColor,
    lastSynced: now,
    createdAt: now,
    updatedAt: now,
    isDeployed: false,
    runCount: 0,
    variables: {},
  })

  const saveResult = await saveWorkflowToNormalizedTables(workflowId, workflowData)
  if (!saveResult.success) {
    await db.delete(workflow).where(eq(workflow.id, workflowId))
    return { success: false, error: `Failed to save workflow state: ${saveResult.error}` }
  }

  if (workflowData.variables && Array.isArray(workflowData.variables)) {
    const variablesRecord: Record<
      string,
      { id: string; name: string; type: string; value: unknown }
    > = {}
    for (const v of workflowData.variables) {
      const varId = (v as { id?: string }).id || crypto.randomUUID()
      const variable = v as { name: string; type?: string; value: unknown }
      variablesRecord[varId] = {
        id: varId,
        name: variable.name,
        type: variable.type || 'string',
        value: variable.value,
      }
    }

    await db
      .update(workflow)
      .set({ variables: variablesRecord, updatedAt: new Date() })
      .where(eq(workflow.id, workflowId))
  }

  logger.info('Imported workflow from upload', {
    fileName,
    workflowId,
    workflowName: dedupedName,
    chatId,
  })

  return {
    success: true,
    output: {
      message: `Workflow "${dedupedName}" imported successfully. It is now available in the workspace and can be edited or run.`,
      workflowId,
      workflowName: dedupedName,
    },
    resources: [{ type: 'workflow', id: workflowId, title: dedupedName }],
  }
}

async function executeTable(
  fileName: string,
  chatId: string,
  workspaceId: string,
  userId: string,
  tableName?: string
): Promise<ToolCallResult> {
  const row = await findUploadRecord(fileName, chatId)
  if (!row) {
    return {
      success: false,
      error: `Upload not found: "${fileName}". Use glob("uploads/*") to list available uploads.`,
    }
  }

  const buffer = await downloadWorkspaceFile(toFileRecord(row))
  const ext = fileName.split('.').pop()?.toLowerCase()

  if (ext === 'csv' || ext === 'tsv') {
    const result = await importCsvToTable({
      buffer,
      fileName,
      workspaceId,
      userId,
      tableName,
      description: `Imported from uploaded file ${fileName}`,
    })

    logger.info('Table created from uploaded CSV', {
      fileName,
      tableId: result.tableId,
      tableName: result.tableName,
      rows: result.rowCount,
      chatId,
    })

    return {
      success: true,
      output: {
        message: `Created table "${result.tableName}" with ${result.columns.length} columns and ${result.rowCount} rows from "${fileName}".`,
        tableId: result.tableId,
        tableName: result.tableName,
        columns: result.columns.map((c) => ({ name: c.name, type: c.type })),
        rowCount: result.rowCount,
      },
      resources: [{ type: 'table', id: result.tableId, title: result.tableName }],
    }
  }

  if (ext === 'json') {
    const content = buffer.toString('utf-8')
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return { success: false, error: `"${fileName}" is not valid JSON.` }
    }

    if (!Array.isArray(parsed)) {
      return {
        success: false,
        error: 'JSON file must contain an array of objects for table import.',
      }
    }

    // Write JSON array as CSV into a temporary buffer so importCsvToTable handles
    // schema inference, sanitization, and insertion consistently
    const rows = parsed as Record<string, unknown>[]
    if (rows.length === 0) {
      return { success: false, error: 'JSON file contains an empty array.' }
    }
    const headerSet = new Set<string>()
    for (const row of rows) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        return { success: false, error: 'Each element in the JSON array must be a plain object.' }
      }
      for (const key of Object.keys(row)) headerSet.add(key)
    }
    const headers = [...headerSet]
    const csvLines = [headers.join(',')]
    for (const row of rows) {
      csvLines.push(
        headers.map((h) => {
          const v = row[h]
          if (v === null || v === undefined) return ''
          const s = String(v)
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s
        }).join(',')
      )
    }
    const csvBuffer = Buffer.from(csvLines.join('\n'), 'utf-8')

    const result = await importCsvToTable({
      buffer: csvBuffer,
      fileName,
      workspaceId,
      userId,
      tableName,
      description: `Imported from uploaded file ${fileName}`,
    })

    logger.info('Table created from uploaded JSON', {
      fileName,
      tableId: result.tableId,
      tableName: result.tableName,
      rows: result.rowCount,
      chatId,
    })

    return {
      success: true,
      output: {
        message: `Created table "${result.tableName}" with ${result.columns.length} columns and ${result.rowCount} rows from "${fileName}".`,
        tableId: result.tableId,
        tableName: result.tableName,
        columns: result.columns.map((c) => ({ name: c.name, type: c.type })),
        rowCount: result.rowCount,
      },
      resources: [{ type: 'table', id: result.tableId, title: result.tableName }],
    }
  }

  return {
    success: false,
    error: `Unsupported file format for table import: "${ext}". Supported: csv, tsv, json`,
  }
}

async function executeKnowledgeBase(
  fileName: string,
  chatId: string,
  workspaceId: string,
  userId: string,
  knowledgeBaseId?: string
): Promise<ToolCallResult> {
  const [updated] = await db
    .update(workspaceFiles)
    .set({ context: 'workspace', chatId: null })
    .where(
      and(
        eq(workspaceFiles.originalName, fileName),
        eq(workspaceFiles.chatId, chatId),
        eq(workspaceFiles.context, 'mothership'),
        isNull(workspaceFiles.deletedAt)
      )
    )
    .returning({
      id: workspaceFiles.id,
      originalName: workspaceFiles.originalName,
      key: workspaceFiles.key,
      size: workspaceFiles.size,
      contentType: workspaceFiles.contentType,
    })

  if (!updated) {
    return {
      success: false,
      error: `Upload not found: "${fileName}". Use glob("uploads/*") to list available uploads.`,
    }
  }

  let kbId = knowledgeBaseId
  let kbName: string

  if (kbId) {
    const existing = await getKnowledgeBaseById(kbId)
    if (!existing) {
      return { success: false, error: `Knowledge base not found: ${kbId}` }
    }
    kbName = existing.name
  } else {
    const baseName = fileName.replace(/\.[^.]+$/, '')
    const requestId = crypto.randomUUID().slice(0, 8)
    const newKb = await createKnowledgeBase(
      {
        name: baseName,
        description: `Created from uploaded file ${fileName}`,
        workspaceId,
        userId,
        embeddingModel: 'text-embedding-3-small',
        embeddingDimension: 1536,
        chunkingConfig: { maxSize: 1024, minSize: 1, overlap: 200 },
      },
      requestId
    )
    kbId = newKb.id
    kbName = newKb.name
  }

  const presignedUrl = await StorageService.generatePresignedDownloadUrl(
    updated.key,
    'workspace',
    5 * 60
  )

  const requestId = crypto.randomUUID().slice(0, 8)
  const doc = await createSingleDocument(
    {
      filename: updated.originalName,
      fileUrl: presignedUrl,
      fileSize: updated.size,
      mimeType: updated.contentType,
    },
    kbId,
    requestId
  )

  processDocumentAsync(kbId, doc.id, {
    filename: updated.originalName,
    fileUrl: presignedUrl,
    fileSize: updated.size,
    mimeType: updated.contentType,
  }, {}).catch((err) => {
    logger.error('Background document processing failed', {
      documentId: doc.id,
      error: err instanceof Error ? err.message : String(err),
    })
  })

  logger.info('File added to knowledge base via materialize_file', {
    fileName,
    fileId: updated.id,
    knowledgeBaseId: kbId,
    documentId: doc.id,
    chatId,
  })

  return {
    success: true,
    output: {
      message: `File "${fileName}" saved and added to knowledge base "${kbName}". Document processing started (chunking + embedding).`,
      fileId: updated.id,
      knowledgeBaseId: kbId,
      knowledgeBaseName: kbName,
      documentId: doc.id,
    },
    resources: [
      { type: 'file', id: updated.id, title: fileName },
      { type: 'knowledgebase', id: kbId, title: kbName },
    ],
  }
}

export async function executeMaterializeFile(
  params: Record<string, unknown>,
  context: ExecutionContext
): Promise<ToolCallResult> {
  const fileName = params.fileName as string | undefined
  if (!fileName) {
    return { success: false, error: "Missing required parameter 'fileName'" }
  }

  if (!context.chatId) {
    return { success: false, error: 'No chat context available for materialize_file' }
  }

  if (!context.workspaceId) {
    return { success: false, error: 'No workspace context available for materialize_file' }
  }

  const operation = (params.operation as string | undefined) || 'save'

  try {
    if (operation === 'import') {
      return await executeImport(fileName, context.chatId, context.workspaceId, context.userId)
    }
    if (operation === 'table') {
      return await executeTable(
        fileName,
        context.chatId,
        context.workspaceId,
        context.userId,
        params.tableName as string | undefined
      )
    }
    if (operation === 'knowledge_base') {
      return await executeKnowledgeBase(
        fileName,
        context.chatId,
        context.workspaceId,
        context.userId,
        params.knowledgeBaseId as string | undefined
      )
    }
    return await executeSave(fileName, context.chatId)
  } catch (err) {
    logger.error('materialize_file failed', {
      fileName,
      operation,
      chatId: context.chatId,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to materialize file',
    }
  }
}

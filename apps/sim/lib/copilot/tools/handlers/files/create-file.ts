import { createLogger } from '@sim/logger'
import type { ToolExecutionContext, ToolExecutionResult } from '@/lib/copilot/tool-executor/types'
import {
  getWorkspaceFileByName,
  uploadWorkspaceFile,
} from '@/lib/uploads/contexts/workspace/workspace-file-manager'
import { getMimeTypeFromExtension } from '@/lib/uploads/utils/file-utils'

const logger = createLogger('CreateFile')

interface CreateFileParams {
  fileName: string
}

export async function executeCreateFile(
  params: CreateFileParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { fileName } = params
  const workspaceId = context.workspaceId

  if (!fileName) {
    return { success: false, error: 'fileName is required' }
  }
  if (!workspaceId) {
    return { success: false, error: 'workspaceId is required' }
  }

  try {
    const existing = await getWorkspaceFileByName(workspaceId, fileName)
    if (existing) {
      logger.warn('Create file rejected because file already exists', {
        fileId: existing.id,
        fileName,
        workspaceId,
      })
      return {
        success: false,
        error: `File "${existing.name}" already exists. Use set_file_context with fileId "${existing.id}" to append to it, or choose a new fileName.`,
      }
    }

    const emptyBuffer = Buffer.from('', 'utf-8')
    const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : ''
    const mimeType = getMimeTypeFromExtension(extension)
    const record = await uploadWorkspaceFile(
      workspaceId,
      context.userId,
      emptyBuffer,
      fileName,
      mimeType
    )

    logger.info('File created', { fileId: record.id, fileName: record.name, workspaceId })

    return {
      success: true,
      output: {
        fileId: record.id,
        fileName: record.name,
        contentType: record.type,
        size: 0,
        message: `File "${record.name}" created. File context is now set — subsequent workspace_file.write calls will automatically target this file.`,
      },
      resources: [
        {
          type: 'file',
          id: record.id,
          title: record.name,
        },
      ],
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to create file', { fileName, error: msg })
    return { success: false, error: `Failed to create file: ${msg}` }
  }
}

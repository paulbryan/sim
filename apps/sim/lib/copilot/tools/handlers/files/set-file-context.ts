import { createLogger } from '@sim/logger'
import type { ToolExecutionContext, ToolExecutionResult } from '@/lib/copilot/tool-executor/types'
import { getWorkspaceFile } from '@/lib/uploads/contexts/workspace/workspace-file-manager'

const logger = createLogger('SetFileContext')

interface SetFileContextParams {
  fileId: string
}

export async function executeSetFileContext(
  params: SetFileContextParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { fileId } = params
  const workspaceId = context.workspaceId

  if (!fileId) {
    return { success: false, error: 'fileId is required' }
  }
  if (!workspaceId) {
    return { success: false, error: 'workspaceId is required' }
  }

  try {
    const file = await getWorkspaceFile(workspaceId, fileId)
    if (!file) {
      return { success: false, error: `File not found: ${fileId}` }
    }

    logger.info('File context set', { fileId, fileName: file.name, workspaceId })

    return {
      success: true,
      output: {
        fileId: file.id,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        message: `File context switched to "${file.name}". Subsequent workspace_file.write calls will now target this file.`,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to validate file context', { fileId, error: msg })
    return { success: false, error: `Failed to validate file: ${msg}` }
  }
}

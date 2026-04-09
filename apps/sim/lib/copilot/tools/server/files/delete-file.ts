import { createLogger } from '@sim/logger'
import { DeleteFile } from '@/lib/copilot/generated/tool-catalog-v1'
import {
  assertServerToolNotAborted,
  type BaseServerTool,
  type ServerToolContext,
} from '@/lib/copilot/tools/server/base-tool'
import {
  deleteWorkspaceFile,
  getWorkspaceFile,
} from '@/lib/uploads/contexts/workspace/workspace-file-manager'

const logger = createLogger('DeleteFileServerTool')

interface DeleteFileArgs {
  fileId: string
  args?: Record<string, unknown>
}

interface DeleteFileResult {
  success: boolean
  message: string
}

export const deleteFileServerTool: BaseServerTool<DeleteFileArgs, DeleteFileResult> = {
  name: DeleteFile.id,
  async execute(params: DeleteFileArgs, context?: ServerToolContext): Promise<DeleteFileResult> {
    if (!context?.userId) {
      throw new Error('Authentication required')
    }
    const workspaceId = context.workspaceId
    if (!workspaceId) {
      return { success: false, message: 'Workspace ID is required' }
    }

    const nested = params.args
    const fileId = params.fileId || (nested?.fileId as string) || ''

    if (!fileId) return { success: false, message: 'fileId is required' }

    const existingFile = await getWorkspaceFile(workspaceId, fileId)
    if (!existingFile) {
      return { success: false, message: `File with ID "${fileId}" not found` }
    }

    assertServerToolNotAborted(context)
    await deleteWorkspaceFile(workspaceId, fileId)

    logger.info('File deleted via delete_file', {
      fileId,
      name: existingFile.name,
      userId: context.userId,
    })

    return {
      success: true,
      message: `File "${existingFile.name}" deleted successfully`,
    }
  },
}

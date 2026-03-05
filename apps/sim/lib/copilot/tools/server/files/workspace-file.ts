import { createLogger } from '@sim/logger'
import type { BaseServerTool, ServerToolContext } from '@/lib/copilot/tools/server/base-tool'
import type { WorkspaceFileArgs, WorkspaceFileResult } from '@/lib/copilot/tools/shared/schemas'
import {
  deleteWorkspaceFile,
  getWorkspaceFile,
  uploadWorkspaceFile,
} from '@/lib/uploads/contexts/workspace/workspace-file-manager'

const logger = createLogger('WorkspaceFileServerTool')

export const workspaceFileServerTool: BaseServerTool<WorkspaceFileArgs, WorkspaceFileResult> = {
  name: 'workspace_file',
  async execute(
    params: WorkspaceFileArgs,
    context?: ServerToolContext
  ): Promise<WorkspaceFileResult> {
    if (!context?.userId) {
      logger.error('Unauthorized attempt to access workspace files')
      throw new Error('Authentication required')
    }

    const { operation, args = {} } = params
    const workspaceId =
      context.workspaceId || ((args as Record<string, unknown>).workspaceId as string | undefined)

    if (!workspaceId) {
      return { success: false, message: 'Workspace ID is required' }
    }

    try {
      switch (operation) {
        case 'write': {
          const fileName = (args as Record<string, unknown>).fileName as string | undefined
          const content = (args as Record<string, unknown>).content as string | undefined
          const contentType =
            ((args as Record<string, unknown>).contentType as string) || 'text/plain'

          if (!fileName) {
            return { success: false, message: 'fileName is required for write operation' }
          }
          if (content === undefined || content === null) {
            return { success: false, message: 'content is required for write operation' }
          }

          const fileBuffer = Buffer.from(content, 'utf-8')
          const result = await uploadWorkspaceFile(
            workspaceId,
            context.userId,
            fileBuffer,
            fileName,
            contentType
          )

          logger.info('Workspace file written via copilot', {
            fileId: result.id,
            name: fileName,
            size: fileBuffer.length,
            contentType,
            userId: context.userId,
          })

          return {
            success: true,
            message: `File "${fileName}" created successfully (${fileBuffer.length} bytes)`,
            data: {
              id: result.id,
              name: result.name,
              contentType,
              size: fileBuffer.length,
            },
          }
        }

        case 'delete': {
          const fileId = (args as Record<string, unknown>).fileId as string | undefined
          if (!fileId) {
            return { success: false, message: 'fileId is required for delete operation' }
          }

          const fileRecord = await getWorkspaceFile(workspaceId, fileId)
          if (!fileRecord) {
            return { success: false, message: `File with ID "${fileId}" not found` }
          }

          await deleteWorkspaceFile(workspaceId, fileId)

          logger.info('Workspace file deleted via copilot', {
            fileId,
            name: fileRecord.name,
            userId: context.userId,
          })

          return {
            success: true,
            message: `File "${fileRecord.name}" deleted successfully`,
            data: { id: fileId, name: fileRecord.name },
          }
        }

        default:
          return {
            success: false,
            message: `Unknown operation: ${operation}. Supported: write, delete. Use the filesystem to list/read files.`,
          }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      logger.error('Error in workspace_file tool', {
        operation,
        error: errorMessage,
        userId: context.userId,
      })

      return {
        success: false,
        message: `Failed to ${operation} file: ${errorMessage}`,
      }
    }
  },
}

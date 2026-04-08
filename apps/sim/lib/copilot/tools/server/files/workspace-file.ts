import { createLogger } from '@sim/logger'
import { WorkspaceFile } from '@/lib/copilot/generated/tool-catalog-v1'
import {
  assertServerToolNotAborted,
  type BaseServerTool,
  type ServerToolContext,
} from '@/lib/copilot/tools/server/base-tool'
import type { WorkspaceFileArgs, WorkspaceFileResult } from '@/lib/copilot/tools/shared/schemas'
import {
  generateDocxFromCode,
  generatePdfFromCode,
  generatePptxFromCode,
} from '@/lib/execution/doc-vm'
import {
  deleteWorkspaceFile,
  downloadWorkspaceFile as downloadWsFile,
  getWorkspaceFile,
  getWorkspaceFileByName,
  renameWorkspaceFile,
  updateWorkspaceFileContent,
  uploadWorkspaceFile,
} from '@/lib/uploads/contexts/workspace/workspace-file-manager'

const logger = createLogger('WorkspaceFileServerTool')

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PDF_MIME = 'application/pdf'
const PPTX_SOURCE_MIME = 'text/x-pptxgenjs'
const DOCX_SOURCE_MIME = 'text/x-docxjs'
const PDF_SOURCE_MIME = 'text/x-pdflibjs'

const EXT_TO_MIME: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.pptx': PPTX_MIME,
  '.docx': DOCX_MIME,
  '.pdf': PDF_MIME,
}

function inferContentType(fileName: string, explicitType?: string): string {
  if (explicitType) return explicitType
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  return EXT_TO_MIME[ext] || 'text/plain'
}

function validateFlatWorkspaceFileName(fileName: string): string | null {
  const trimmed = fileName.trim()
  if (!trimmed) return 'File name cannot be empty'
  if (trimmed.includes('/')) {
    return 'Workspace files use a flat namespace. Use a plain file name like "report.csv", not a path like "files/reports/report.csv".'
  }
  return null
}

export const workspaceFileServerTool: BaseServerTool<WorkspaceFileArgs, WorkspaceFileResult> = {
  name: WorkspaceFile.id,
  async execute(
    params: WorkspaceFileArgs,
    context?: ServerToolContext
  ): Promise<WorkspaceFileResult> {
    const withMessageId = (message: string) =>
      context?.messageId ? `${message} [messageId:${context.messageId}]` : message

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
          const fileId = (args as Record<string, unknown>).fileId as string | undefined
          const content = (args as Record<string, unknown>).content as string | undefined
          const explicitType = (args as Record<string, unknown>).contentType as string | undefined

          if (!fileName) {
            return { success: false, message: 'fileName is required for write operation' }
          }
          if (content === undefined || content === null) {
            return { success: false, message: 'content is required for write operation' }
          }
          const fileNameValidationError = validateFlatWorkspaceFileName(fileName)
          if (fileNameValidationError) {
            return { success: false, message: fileNameValidationError }
          }

          const lowerName = fileName.toLowerCase()
          const isPptx = lowerName.endsWith('.pptx')
          const isDocx = lowerName.endsWith('.docx')
          const isPdf = lowerName.endsWith('.pdf')
          const isDoc = isPptx || isDocx || isPdf
          const sourceMime = isPptx
            ? PPTX_SOURCE_MIME
            : isDocx
              ? DOCX_SOURCE_MIME
              : isPdf
                ? PDF_SOURCE_MIME
                : undefined

          const existingFile = fileId
            ? await getWorkspaceFile(workspaceId, fileId)
            : await getWorkspaceFileByName(workspaceId, fileName)

          if (existingFile) {
            const currentBuffer = await downloadWsFile(existingFile)
            const combined = isDoc
              ? `${currentBuffer.toString('utf-8')}\n{\n${content}\n}`
              : `${currentBuffer.toString('utf-8')}\n${content}`

            if (isDoc) {
              const formatName = isPptx ? 'PPTX' : isDocx ? 'DOCX' : 'PDF'
              const generator = isPptx
                ? generatePptxFromCode
                : isDocx
                  ? generateDocxFromCode
                  : generatePdfFromCode
              try {
                await generator(combined, workspaceId)
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                return {
                  success: false,
                  message: `${formatName} generation failed after append: ${msg}. Fix the content and retry.`,
                }
              }
            }

            const combinedBuffer = Buffer.from(combined, 'utf-8')
            assertServerToolNotAborted(context)
            await updateWorkspaceFileContent(
              workspaceId,
              existingFile.id,
              context.userId,
              combinedBuffer,
              sourceMime
            )

            logger.info('Workspace file appended via write', {
              fileId: existingFile.id,
              name: existingFile.name,
              appendedSize: content.length,
              totalSize: combinedBuffer.length,
              userId: context.userId,
            })

            return {
              success: true,
              message: `Content appended to "${existingFile.name}" (${content.length} bytes added, ${combinedBuffer.length} bytes total)`,
              data: {
                id: existingFile.id,
                name: existingFile.name,
                size: combinedBuffer.length,
              },
            }
          }

          let contentType: string
          if (isDoc) {
            const formatName = isPptx ? 'PPTX' : isDocx ? 'DOCX' : 'PDF'
            const generator = isPptx
              ? generatePptxFromCode
              : isDocx
                ? generateDocxFromCode
                : generatePdfFromCode
            try {
              await generator(content, workspaceId)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              logger.error(`${formatName} code validation failed`, { error: msg, fileName })
              return {
                success: false,
                message: `${formatName} generation failed: ${msg}. Fix the code and retry.`,
              }
            }
            contentType = sourceMime!
          } else {
            contentType = inferContentType(fileName, explicitType)
          }

          const fileBuffer = Buffer.from(content, 'utf-8')

          assertServerToolNotAborted(context)
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
              downloadUrl: result.url,
            },
          }
        }

        case 'update': {
          const fileId = (args as Record<string, unknown>).fileId as string | undefined
          const content = (args as Record<string, unknown>).content as string | undefined

          if (!fileId) {
            return { success: false, message: 'fileId is required for update operation' }
          }
          if (content === undefined || content === null) {
            return { success: false, message: 'content is required for update operation' }
          }

          const fileRecord = await getWorkspaceFile(workspaceId, fileId)
          if (!fileRecord) {
            return { success: false, message: `File with ID "${fileId}" not found` }
          }

          const updateLowerName = fileRecord.name?.toLowerCase() ?? ''
          const isPptxUpdate = updateLowerName.endsWith('.pptx')
          const isDocxUpdate = updateLowerName.endsWith('.docx')
          const isPdfUpdate = updateLowerName.endsWith('.pdf')
          const isDocUpdate = isPptxUpdate || isDocxUpdate || isPdfUpdate

          if (isDocUpdate) {
            const formatName = isPptxUpdate ? 'PPTX' : isDocxUpdate ? 'DOCX' : 'PDF'
            const generator = isPptxUpdate
              ? generatePptxFromCode
              : isDocxUpdate
                ? generateDocxFromCode
                : generatePdfFromCode
            try {
              await generator(content, workspaceId)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              return {
                success: false,
                message: `${formatName} generation failed: ${msg}. Fix the code and retry.`,
              }
            }
          }

          const updateSourceMime = isPptxUpdate
            ? PPTX_SOURCE_MIME
            : isDocxUpdate
              ? DOCX_SOURCE_MIME
              : isPdfUpdate
                ? PDF_SOURCE_MIME
                : undefined
          const fileBuffer = Buffer.from(content, 'utf-8')

          assertServerToolNotAborted(context)
          await updateWorkspaceFileContent(
            workspaceId,
            fileId,
            context.userId,
            fileBuffer,
            updateSourceMime
          )

          logger.info('Workspace file updated via copilot', {
            fileId,
            name: fileRecord.name,
            size: fileBuffer.length,
            userId: context.userId,
          })

          return {
            success: true,
            message: `File "${fileRecord.name}" updated successfully (${fileBuffer.length} bytes)`,
            data: {
              id: fileId,
              name: fileRecord.name,
              size: fileBuffer.length,
            },
          }
        }

        case 'rename': {
          const fileId = (args as Record<string, unknown>).fileId as string | undefined
          const newName = (args as Record<string, unknown>).newName as string | undefined

          if (!fileId) {
            return { success: false, message: 'fileId is required for rename operation' }
          }
          if (!newName) {
            return { success: false, message: 'newName is required for rename operation' }
          }
          const fileNameValidationError = validateFlatWorkspaceFileName(newName)
          if (fileNameValidationError) {
            return { success: false, message: fileNameValidationError }
          }

          const fileRecord = await getWorkspaceFile(workspaceId, fileId)
          if (!fileRecord) {
            return { success: false, message: `File with ID "${fileId}" not found` }
          }

          const oldName = fileRecord.name
          assertServerToolNotAborted(context)
          await renameWorkspaceFile(workspaceId, fileId, newName)

          logger.info('Workspace file renamed via copilot', {
            fileId,
            oldName,
            newName,
            userId: context.userId,
          })

          return {
            success: true,
            message: `File renamed from "${oldName}" to "${newName}"`,
            data: { id: fileId, name: newName },
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

          assertServerToolNotAborted(context)
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

        case 'patch': {
          const fileId = (args as Record<string, unknown>).fileId as string | undefined
          const edit = (args as Record<string, unknown>).edit as
            | {
                mode: string
                before_anchor?: string
                after_anchor?: string
                start_anchor?: string
                end_anchor?: string
                anchor?: string
                content?: string
                occurrence?: number
              }
            | undefined
          const legacyEdits = (args as Record<string, unknown>).edits as
            | { search: string; replace: string }[]
            | undefined

          if (!fileId) {
            return { success: false, message: 'fileId is required for patch operation' }
          }

          const fileRecord = await getWorkspaceFile(workspaceId, fileId)
          if (!fileRecord) {
            return { success: false, message: `File with ID "${fileId}" not found` }
          }

          const currentBuffer = await downloadWsFile(fileRecord)
          let content = currentBuffer.toString('utf-8')

          if (edit && typeof edit.mode === 'string') {
            const lines = content.split('\n')

            const defaultOccurrence = edit.occurrence ?? 1

            const findAnchorLine = (
              anchor: string,
              occurrence = defaultOccurrence,
              afterIndex = -1
            ): { index: number; error?: string } => {
              const trimmed = anchor.trim()
              let count = 0
              for (let i = afterIndex + 1; i < lines.length; i++) {
                if (lines[i].trim() === trimmed) {
                  count++
                  if (count === occurrence) return { index: i }
                }
              }
              if (count === 0) {
                return {
                  index: -1,
                  error: `Anchor line not found in "${fileRecord.name}": "${anchor.slice(0, 100)}"`,
                }
              }
              return {
                index: -1,
                error: `Anchor line occurrence ${occurrence} not found (only ${count} match${count > 1 ? 'es' : ''}) in "${fileRecord.name}": "${anchor.slice(0, 100)}"`,
              }
            }

            if (edit.mode === 'replace_between') {
              if (!edit.before_anchor || !edit.after_anchor) {
                return {
                  success: false,
                  message: 'replace_between requires before_anchor and after_anchor',
                }
              }
              const before = findAnchorLine(edit.before_anchor)
              if (before.error) return { success: false, message: `Patch failed: ${before.error}` }
              const after = findAnchorLine(edit.after_anchor, defaultOccurrence, before.index)
              if (after.error) return { success: false, message: `Patch failed: ${after.error}` }
              if (after.index <= before.index) {
                return {
                  success: false,
                  message: 'Patch failed: after_anchor must appear after before_anchor in the file',
                }
              }

              const newLines = [
                ...lines.slice(0, before.index + 1),
                ...(edit.content ?? '').split('\n'),
                ...lines.slice(after.index),
              ]
              content = newLines.join('\n')
            } else if (edit.mode === 'insert_after') {
              if (!edit.anchor) {
                return { success: false, message: 'insert_after requires anchor' }
              }
              const found = findAnchorLine(edit.anchor)
              if (found.error) return { success: false, message: `Patch failed: ${found.error}` }

              const newLines = [
                ...lines.slice(0, found.index + 1),
                ...(edit.content ?? '').split('\n'),
                ...lines.slice(found.index + 1),
              ]
              content = newLines.join('\n')
            } else if (edit.mode === 'delete_between') {
              if (!edit.start_anchor || !edit.end_anchor) {
                return {
                  success: false,
                  message: 'delete_between requires start_anchor and end_anchor',
                }
              }
              const start = findAnchorLine(edit.start_anchor)
              if (start.error) return { success: false, message: `Patch failed: ${start.error}` }
              const end = findAnchorLine(edit.end_anchor, defaultOccurrence, start.index)
              if (end.error) return { success: false, message: `Patch failed: ${end.error}` }
              if (end.index <= start.index) {
                return {
                  success: false,
                  message: 'Patch failed: end_anchor must appear after start_anchor in the file',
                }
              }

              const newLines = [...lines.slice(0, start.index), ...lines.slice(end.index)]
              content = newLines.join('\n')
            } else {
              return {
                success: false,
                message: `Unknown edit mode: "${edit.mode}". Use "replace_between", "insert_after", or "delete_between".`,
              }
            }
          } else if (legacyEdits && Array.isArray(legacyEdits) && legacyEdits.length > 0) {
            for (const le of legacyEdits) {
              const firstIdx = content.indexOf(le.search)
              if (firstIdx === -1) {
                return {
                  success: false,
                  message: `Patch failed: search string not found in file "${fileRecord.name}". Search: "${le.search.slice(0, 100)}${le.search.length > 100 ? '...' : ''}"`,
                }
              }
              if (content.indexOf(le.search, firstIdx + 1) !== -1) {
                return {
                  success: false,
                  message: `Patch failed: search string is ambiguous — found at multiple locations in "${fileRecord.name}". Use a longer, unique search string.`,
                }
              }
              content =
                content.slice(0, firstIdx) + le.replace + content.slice(firstIdx + le.search.length)
            }
          } else {
            return {
              success: false,
              message: 'patch requires either an edit object (with mode) or a legacy edits array',
            }
          }

          const patchLowerName = fileRecord.name?.toLowerCase() ?? ''
          const isPptxPatch = patchLowerName.endsWith('.pptx')
          const isDocxPatch = patchLowerName.endsWith('.docx')
          const isPdfPatch = patchLowerName.endsWith('.pdf')
          const isDocPatch = isPptxPatch || isDocxPatch || isPdfPatch

          if (isDocPatch) {
            const formatName = isPptxPatch ? 'PPTX' : isDocxPatch ? 'DOCX' : 'PDF'
            const generator = isPptxPatch
              ? generatePptxFromCode
              : isDocxPatch
                ? generateDocxFromCode
                : generatePdfFromCode
            try {
              await generator(content, workspaceId)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              return {
                success: false,
                message: `Patched ${formatName} code failed to compile: ${msg}. Fix the edits and retry.`,
              }
            }
          }

          const patchSourceMime = isPptxPatch
            ? PPTX_SOURCE_MIME
            : isDocxPatch
              ? DOCX_SOURCE_MIME
              : isPdfPatch
                ? PDF_SOURCE_MIME
                : undefined
          const patchedBuffer = Buffer.from(content, 'utf-8')
          assertServerToolNotAborted(context)
          await updateWorkspaceFileContent(
            workspaceId,
            fileId,
            context.userId,
            patchedBuffer,
            patchSourceMime
          )

          const editMode = edit?.mode ?? 'legacy'
          logger.info('Workspace file patched via copilot', {
            fileId,
            name: fileRecord.name,
            editMode,
            userId: context.userId,
          })

          return {
            success: true,
            message: `File "${fileRecord.name}" patched successfully (${editMode} edit applied)`,
            data: {
              id: fileId,
              name: fileRecord.name,
              size: patchedBuffer.length,
            },
          }
        }

        default:
          return {
            success: false,
            message: `Unknown operation: ${operation}. Supported: write, update, patch, rename, delete.`,
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

import { createLogger } from '@sim/logger'
import { WorkspaceFile } from '@/lib/copilot/generated/tool-catalog-v1'
import {
  assertServerToolNotAborted,
  type BaseServerTool,
  type ServerToolContext,
} from '@/lib/copilot/tools/server/base-tool'
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

type WorkspaceFileOperation = 'create' | 'append' | 'update' | 'delete' | 'rename' | 'patch'

type WorkspaceFileTarget =
  | {
      kind: 'new_file'
      fileName: string
      fileId?: string
    }
  | {
      kind: 'file_id'
      fileId: string
      fileName?: string
    }

type WorkspaceFileEdit =
  | {
      strategy: 'search_replace'
      search: string
      replace: string
      replaceAll?: boolean
    }
  | {
      strategy: 'anchored'
      mode: 'replace_between' | 'insert_after' | 'delete_between'
      occurrence?: number
      before_anchor?: string
      after_anchor?: string
      start_anchor?: string
      end_anchor?: string
      anchor?: string
      content?: string
    }

type WorkspaceFileArgs = {
  operation: WorkspaceFileOperation
  target?: WorkspaceFileTarget
  title?: string
  content?: string
  contentType?: string
  newName?: string
  edit?: WorkspaceFileEdit
}

type WorkspaceFileResult = {
  success: boolean
  message: string
  data?: Record<string, unknown>
}

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

export function inferContentType(fileName: string, explicitType?: string): string {
  if (explicitType) return explicitType
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  return EXT_TO_MIME[ext] || 'text/plain'
}

export function validateFlatWorkspaceFileName(fileName: string): string | null {
  const trimmed = fileName.trim()
  if (!trimmed) return 'File name cannot be empty'
  if (trimmed.includes('/')) {
    return 'Workspace files use a flat namespace. Use a plain file name like "report.csv", not a path like "files/reports/report.csv".'
  }
  return null
}

function getDocumentFormatInfo(fileName: string): {
  isDoc: boolean
  formatName?: 'PPTX' | 'DOCX' | 'PDF'
  sourceMime?: string
  generator?: (code: string, workspaceId: string, signal?: AbortSignal) => Promise<Buffer>
} {
  const lowerName = fileName.toLowerCase()
  if (lowerName.endsWith('.pptx')) {
    return {
      isDoc: true,
      formatName: 'PPTX',
      sourceMime: PPTX_SOURCE_MIME,
      generator: generatePptxFromCode,
    }
  }
  if (lowerName.endsWith('.docx')) {
    return {
      isDoc: true,
      formatName: 'DOCX',
      sourceMime: DOCX_SOURCE_MIME,
      generator: generateDocxFromCode,
    }
  }
  if (lowerName.endsWith('.pdf')) {
    return {
      isDoc: true,
      formatName: 'PDF',
      sourceMime: PDF_SOURCE_MIME,
      generator: generatePdfFromCode,
    }
  }
  return { isDoc: false }
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

    const raw = params as Record<string, unknown>
    const nested = raw.args as Record<string, unknown> | undefined
    const normalized: WorkspaceFileArgs =
      params.operation && params.target
        ? params
        : nested && typeof nested === 'object'
          ? {
              operation: (nested.operation ?? raw.operation) as WorkspaceFileOperation,
              target: (nested.target ?? raw.target) as WorkspaceFileTarget | undefined,
              title: (nested.title ?? raw.title) as string | undefined,
              content: (nested.content ?? raw.content) as string | undefined,
              contentType: (nested.contentType ?? raw.contentType) as string | undefined,
              newName: (nested.newName ?? raw.newName) as string | undefined,
              edit: (nested.edit ?? raw.edit) as WorkspaceFileEdit | undefined,
            }
          : params
    const { operation } = normalized
    const workspaceId = context.workspaceId

    if (!workspaceId) {
      return { success: false, message: 'Workspace ID is required' }
    }

    try {
      switch (operation) {
        case 'create': {
          const target = normalized.target
          if (!target || target.kind !== 'new_file') {
            return {
              success: false,
              message: 'create requires target.kind=new_file with target.fileName',
            }
          }

          const fileName = target.fileName
          const content = normalized.content ?? ''
          const explicitType = normalized.contentType
          const fileNameValidationError = validateFlatWorkspaceFileName(fileName)
          if (fileNameValidationError) return { success: false, message: fileNameValidationError }

          const existingFile = await getWorkspaceFileByName(workspaceId, fileName)
          if (existingFile) {
            return { success: false, message: `File "${fileName}" already exists` }
          }

          const docInfo = getDocumentFormatInfo(fileName)
          let contentType = inferContentType(fileName, explicitType)
          if (docInfo.isDoc) {
            try {
              await docInfo.generator!(content, workspaceId)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              return {
                success: false,
                message: `${docInfo.formatName} generation failed: ${msg}. Fix the code and retry.`,
              }
            }
            contentType = docInfo.sourceMime!
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

          logger.info('Workspace file created via copilot', {
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

        case 'append': {
          const target = normalized.target
          if (!target || target.kind !== 'file_id') {
            return {
              success: false,
              message: 'append requires target.kind=file_id with target.fileId',
            }
          }
          if (normalized.content === undefined || normalized.content === null) {
            return { success: false, message: 'content is required for append operation' }
          }

          const existingFile = await getWorkspaceFile(workspaceId, target.fileId)
          if (!existingFile) {
            return { success: false, message: `File with ID "${target.fileId}" not found` }
          }
          if (target.fileName && target.fileName !== existingFile.name) {
            return {
              success: false,
              message: `Target mismatch: fileId "${target.fileId}" is "${existingFile.name}", not "${target.fileName}"`,
            }
          }

          const docInfo = getDocumentFormatInfo(existingFile.name)
          const currentBuffer = await downloadWsFile(existingFile)
          const combined = docInfo.isDoc
            ? `${currentBuffer.toString('utf-8')}\n{\n${normalized.content}\n}`
            : `${currentBuffer.toString('utf-8')}\n${normalized.content}`

          if (docInfo.isDoc) {
            try {
              await docInfo.generator!(combined, workspaceId)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              return {
                success: false,
                message: `${docInfo.formatName} generation failed after append: ${msg}. Fix the content and retry.`,
              }
            }
          }

          const combinedBuffer = Buffer.from(combined, 'utf-8')
          assertServerToolNotAborted(context)
          const appendMime =
            docInfo.sourceMime || inferContentType(existingFile.name, normalized.contentType)
          await updateWorkspaceFileContent(
            workspaceId,
            existingFile.id,
            context.userId,
            combinedBuffer,
            appendMime
          )

          logger.info('Workspace file appended via copilot', {
            fileId: existingFile.id,
            name: existingFile.name,
            appendedSize: normalized.content.length,
            totalSize: combinedBuffer.length,
            userId: context.userId,
          })

          return {
            success: true,
            message: `Content appended to "${existingFile.name}" (${normalized.content.length} bytes added, ${combinedBuffer.length} bytes total)`,
            data: {
              id: existingFile.id,
              name: existingFile.name,
              size: combinedBuffer.length,
              contentType: appendMime,
            },
          }
        }

        case 'update': {
          const target = normalized.target
          if (!target || target.kind !== 'file_id') {
            return {
              success: false,
              message: 'update requires target.kind=file_id with target.fileId',
            }
          }
          if (normalized.content === undefined || normalized.content === null) {
            return { success: false, message: 'content is required for update operation' }
          }

          const fileRecord = await getWorkspaceFile(workspaceId, target.fileId)
          if (!fileRecord) {
            return { success: false, message: `File with ID "${target.fileId}" not found` }
          }
          if (target.fileName && target.fileName !== fileRecord.name) {
            return {
              success: false,
              message: `Target mismatch: fileId "${target.fileId}" is "${fileRecord.name}", not "${target.fileName}"`,
            }
          }

          const docInfo = getDocumentFormatInfo(fileRecord.name)
          if (docInfo.isDoc) {
            try {
              await docInfo.generator!(normalized.content, workspaceId)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              return {
                success: false,
                message: `${docInfo.formatName} generation failed: ${msg}. Fix the code and retry.`,
              }
            }
          }

          const fileBuffer = Buffer.from(normalized.content, 'utf-8')
          assertServerToolNotAborted(context)
          const updateMime =
            docInfo.sourceMime || inferContentType(fileRecord.name, normalized.contentType)
          await updateWorkspaceFileContent(
            workspaceId,
            target.fileId,
            context.userId,
            fileBuffer,
            updateMime
          )

          logger.info('Workspace file updated via copilot', {
            fileId: target.fileId,
            name: fileRecord.name,
            size: fileBuffer.length,
            userId: context.userId,
          })

          return {
            success: true,
            message: `File "${fileRecord.name}" updated successfully (${fileBuffer.length} bytes)`,
            data: {
              id: target.fileId,
              name: fileRecord.name,
              size: fileBuffer.length,
              contentType: updateMime,
            },
          }
        }

        case 'rename': {
          const target = normalized.target
          if (!target || target.kind !== 'file_id') {
            return {
              success: false,
              message: 'rename requires target.kind=file_id with target.fileId',
            }
          }
          if (!normalized.newName) {
            return { success: false, message: 'newName is required for rename operation' }
          }
          const fileNameValidationError = validateFlatWorkspaceFileName(normalized.newName)
          if (fileNameValidationError) return { success: false, message: fileNameValidationError }

          const fileRecord = await getWorkspaceFile(workspaceId, target.fileId)
          if (!fileRecord) {
            return { success: false, message: `File with ID "${target.fileId}" not found` }
          }

          const oldName = fileRecord.name
          assertServerToolNotAborted(context)
          await renameWorkspaceFile(workspaceId, target.fileId, normalized.newName)

          logger.info('Workspace file renamed via copilot', {
            fileId: target.fileId,
            oldName,
            newName: normalized.newName,
            userId: context.userId,
          })

          return {
            success: true,
            message: `File renamed from "${oldName}" to "${normalized.newName}"`,
            data: { id: target.fileId, name: normalized.newName },
          }
        }

        case 'delete': {
          const target = normalized.target
          if (!target || target.kind !== 'file_id') {
            return {
              success: false,
              message: 'delete requires target.kind=file_id with target.fileId',
            }
          }

          const fileRecord = await getWorkspaceFile(workspaceId, target.fileId)
          if (!fileRecord) {
            return { success: false, message: `File with ID "${target.fileId}" not found` }
          }

          assertServerToolNotAborted(context)
          await deleteWorkspaceFile(workspaceId, target.fileId)

          logger.info('Workspace file deleted via copilot', {
            fileId: target.fileId,
            name: fileRecord.name,
            userId: context.userId,
          })

          return {
            success: true,
            message: `File "${fileRecord.name}" deleted successfully`,
            data: { id: target.fileId, name: fileRecord.name },
          }
        }

        case 'patch': {
          const target = normalized.target
          if (!target || target.kind !== 'file_id') {
            return {
              success: false,
              message: 'patch requires target.kind=file_id with target.fileId',
            }
          }
          if (!normalized.edit) {
            return { success: false, message: 'edit is required for patch operation' }
          }

          const fileRecord = await getWorkspaceFile(workspaceId, target.fileId)
          if (!fileRecord) {
            return { success: false, message: `File with ID "${target.fileId}" not found` }
          }

          const currentBuffer = await downloadWsFile(fileRecord)
          let content = currentBuffer.toString('utf-8')

          if (normalized.edit.strategy === 'anchored') {
            const lines = content.split('\n')
            const defaultOccurrence = normalized.edit.occurrence ?? 1

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

            if (normalized.edit.mode === 'replace_between') {
              if (!normalized.edit.before_anchor || !normalized.edit.after_anchor) {
                return {
                  success: false,
                  message: 'replace_between requires before_anchor and after_anchor',
                }
              }
              const before = findAnchorLine(normalized.edit.before_anchor)
              if (before.error) return { success: false, message: `Patch failed: ${before.error}` }
              const after = findAnchorLine(
                normalized.edit.after_anchor,
                defaultOccurrence,
                before.index
              )
              if (after.error) return { success: false, message: `Patch failed: ${after.error}` }
              if (after.index <= before.index) {
                return {
                  success: false,
                  message: 'Patch failed: after_anchor must appear after before_anchor in the file',
                }
              }
              const newLines = [
                ...lines.slice(0, before.index + 1),
                ...(normalized.edit.content ?? '').split('\n'),
                ...lines.slice(after.index),
              ]
              content = newLines.join('\n')
            } else if (normalized.edit.mode === 'insert_after') {
              if (!normalized.edit.anchor) {
                return { success: false, message: 'insert_after requires anchor' }
              }
              const found = findAnchorLine(normalized.edit.anchor)
              if (found.error) return { success: false, message: `Patch failed: ${found.error}` }
              const newLines = [
                ...lines.slice(0, found.index + 1),
                ...(normalized.edit.content ?? '').split('\n'),
                ...lines.slice(found.index + 1),
              ]
              content = newLines.join('\n')
            } else if (normalized.edit.mode === 'delete_between') {
              if (!normalized.edit.start_anchor || !normalized.edit.end_anchor) {
                return {
                  success: false,
                  message: 'delete_between requires start_anchor and end_anchor',
                }
              }
              const start = findAnchorLine(normalized.edit.start_anchor)
              if (start.error) return { success: false, message: `Patch failed: ${start.error}` }
              const end = findAnchorLine(normalized.edit.end_anchor, defaultOccurrence, start.index)
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
                message: `Unknown anchored patch mode: "${normalized.edit.mode}"`,
              }
            }
          } else if (normalized.edit.strategy === 'search_replace') {
            const search = normalized.edit.search
            const replace = normalized.edit.replace
            const firstIdx = content.indexOf(search)
            if (firstIdx === -1) {
              return {
                success: false,
                message: `Patch failed: search string not found in file "${fileRecord.name}". Search: "${search.slice(0, 100)}${search.length > 100 ? '...' : ''}"`,
              }
            }
            if (!normalized.edit.replaceAll && content.indexOf(search, firstIdx + 1) !== -1) {
              return {
                success: false,
                message: `Patch failed: search string is ambiguous — found at multiple locations in "${fileRecord.name}". Use a longer unique search string or replaceAll.`,
              }
            }
            content = normalized.edit.replaceAll
              ? content.split(search).join(replace)
              : content.slice(0, firstIdx) + replace + content.slice(firstIdx + search.length)
          } else {
            return {
              success: false,
              message: `Unknown patch strategy: "${(normalized.edit as { strategy?: string }).strategy}"`,
            }
          }

          const docInfo = getDocumentFormatInfo(fileRecord.name)
          if (docInfo.isDoc) {
            try {
              await docInfo.generator!(content, workspaceId)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              return {
                success: false,
                message: `Patched ${docInfo.formatName} code failed to compile: ${msg}. Fix the edit and retry.`,
              }
            }
          }

          const patchedBuffer = Buffer.from(content, 'utf-8')
          assertServerToolNotAborted(context)
          const patchMime = docInfo.sourceMime || inferContentType(fileRecord.name)
          await updateWorkspaceFileContent(
            workspaceId,
            target.fileId,
            context.userId,
            patchedBuffer,
            patchMime
          )

          logger.info('Workspace file patched via copilot', {
            fileId: target.fileId,
            name: fileRecord.name,
            strategy: normalized.edit.strategy,
            userId: context.userId,
          })

          return {
            success: true,
            message: `File "${fileRecord.name}" patched successfully (${normalized.edit.strategy} edit applied)`,
            data: {
              id: target.fileId,
              name: fileRecord.name,
              size: patchedBuffer.length,
              contentType: patchMime,
            },
          }
        }

        default:
          return {
            success: false,
            message: `Unknown operation: ${operation}. Supported: create, append, update, patch, rename, delete.`,
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

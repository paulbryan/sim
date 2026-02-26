import { createLogger } from '@sim/logger'
import type { ExecutionContext, ToolCallResult } from '@/lib/copilot/orchestrator/types'
import {
  downloadWorkspaceFile,
  listWorkspaceFiles,
} from '@/lib/uploads/contexts/workspace/workspace-file-manager'
import { isImageFileType } from '@/lib/uploads/utils/file-utils'
import { getOrMaterializeVFS } from '@/lib/copilot/vfs'

const logger = createLogger('VfsTools')

export async function executeVfsGrep(
  params: Record<string, unknown>,
  context: ExecutionContext
): Promise<ToolCallResult> {
  const pattern = params.pattern as string | undefined
  if (!pattern) {
    return { success: false, error: "Missing required parameter 'pattern'" }
  }

  const workspaceId = context.workspaceId
  if (!workspaceId) {
    return { success: false, error: 'No workspace context available' }
  }

  try {
    const vfs = await getOrMaterializeVFS(workspaceId, context.userId)
    const result = vfs.grep(pattern, params.path as string | undefined, {
      maxResults: (params.maxResults as number) ?? 50,
      outputMode: (params.output_mode as 'content' | 'files_with_matches' | 'count') ?? 'content',
      ignoreCase: (params.ignoreCase as boolean) ?? false,
      lineNumbers: (params.lineNumbers as boolean) ?? true,
      context: (params.context as number) ?? 0,
    })
    const outputMode = (params.output_mode as string) ?? 'content'
    const key =
      outputMode === 'files_with_matches' ? 'files' : outputMode === 'count' ? 'counts' : 'matches'
    const matchCount = Array.isArray(result)
      ? result.length
      : typeof result === 'object'
        ? Object.keys(result).length
        : 0
    logger.debug('vfs_grep result', { pattern, path: params.path, outputMode, matchCount })
    return { success: true, output: { [key]: result } }
  } catch (err) {
    logger.error('vfs_grep failed', {
      pattern,
      path: params.path,
      error: err instanceof Error ? err.message : String(err),
    })
    return { success: false, error: err instanceof Error ? err.message : 'vfs_grep failed' }
  }
}

export async function executeVfsGlob(
  params: Record<string, unknown>,
  context: ExecutionContext
): Promise<ToolCallResult> {
  const pattern = params.pattern as string | undefined
  if (!pattern) {
    return { success: false, error: "Missing required parameter 'pattern'" }
  }

  const workspaceId = context.workspaceId
  if (!workspaceId) {
    return { success: false, error: 'No workspace context available' }
  }

  try {
    const vfs = await getOrMaterializeVFS(workspaceId, context.userId)
    const files = vfs.glob(pattern)
    logger.debug('vfs_glob result', { pattern, fileCount: files.length })
    return { success: true, output: { files } }
  } catch (err) {
    logger.error('vfs_glob failed', {
      pattern,
      error: err instanceof Error ? err.message : String(err),
    })
    return { success: false, error: err instanceof Error ? err.message : 'vfs_glob failed' }
  }
}

export async function executeVfsRead(
  params: Record<string, unknown>,
  context: ExecutionContext
): Promise<ToolCallResult> {
  const path = params.path as string | undefined
  if (!path) {
    return { success: false, error: "Missing required parameter 'path'" }
  }

  const workspaceId = context.workspaceId
  if (!workspaceId) {
    return { success: false, error: 'No workspace context available' }
  }

  try {
    const vfs = await getOrMaterializeVFS(workspaceId, context.userId)
    const result = vfs.read(
      path,
      params.offset as number | undefined,
      params.limit as number | undefined
    )
    if (!result) {
      // Dynamic content fetch for workspace files: read("files/lit-rock.json")
      // resolves to the actual file content from storage.
      const fileContent = await tryReadWorkspaceFile(path, workspaceId)
      if (fileContent) {
        logger.debug('vfs_read resolved workspace file', { path, totalLines: fileContent.totalLines })
        return { success: true, output: fileContent }
      }

      const suggestions = vfs.suggestSimilar(path)
      logger.warn('vfs_read file not found', { path, suggestions })
      const hint =
        suggestions.length > 0
          ? ` Did you mean: ${suggestions.join(', ')}?`
          : ' Use glob to discover available paths.'
      return { success: false, error: `File not found: ${path}.${hint}` }
    }
    logger.debug('vfs_read result', { path, totalLines: result.totalLines })
    return { success: true, output: result }
  } catch (err) {
    logger.error('vfs_read failed', {
      path,
      error: err instanceof Error ? err.message : String(err),
    })
    return { success: false, error: err instanceof Error ? err.message : 'vfs_read failed' }
  }
}

const MAX_TEXT_READ_BYTES = 512 * 1024 // 512 KB
const MAX_IMAGE_READ_BYTES = 5 * 1024 * 1024 // 5 MB

const TEXT_TYPES = new Set([
  'text/plain', 'text/csv', 'text/markdown', 'text/html', 'text/xml',
  'application/json', 'application/xml', 'application/javascript',
])

const PARSEABLE_EXTENSIONS = new Set([
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt',
])

function isReadableType(contentType: string): boolean {
  return TEXT_TYPES.has(contentType) || contentType.startsWith('text/')
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

interface FileReadResult {
  content: string
  totalLines: number
  attachment?: {
    type: string
    source: {
      type: 'base64'
      media_type: string
      data: string
    }
  }
}

async function tryReadWorkspaceFile(
  path: string,
  workspaceId: string
): Promise<FileReadResult | null> {
  const match = path.match(/^files\/(.+?)(?:\/content)?$/)
  if (!match) return null
  const fileName = match[1]

  if (fileName.endsWith('/meta.json') || path.endsWith('/meta.json')) return null

  try {
    const files = await listWorkspaceFiles(workspaceId)
    const record = files.find(
      (f) => f.name === fileName || f.name.normalize('NFC') === fileName.normalize('NFC')
    )
    if (!record) return null

    if (isImageFileType(record.type)) {
      if (record.size > MAX_IMAGE_READ_BYTES) {
        return {
          content: `[Image too large: ${record.name} (${(record.size / 1024 / 1024).toFixed(1)}MB, limit 5MB)]`,
          totalLines: 1,
        }
      }
      const buffer = await downloadWorkspaceFile(record)
      return {
        content: `Image: ${record.name} (${(record.size / 1024).toFixed(1)}KB, ${record.type})`,
        totalLines: 1,
        attachment: {
          type: 'image',
          source: {
            type: 'base64',
            media_type: record.type,
            data: buffer.toString('base64'),
          },
        },
      }
    }

    const ext = getExtension(record.name)
    if (PARSEABLE_EXTENSIONS.has(ext)) {
      const buffer = await downloadWorkspaceFile(record)
      try {
        const { parseBuffer } = await import('@/lib/file-parsers')
        const result = await parseBuffer(buffer, ext)
        const content = result.content || ''
        return { content, totalLines: content.split('\n').length }
      } catch (parseErr) {
        logger.warn('Failed to parse document', { fileName: record.name, ext, error: parseErr instanceof Error ? parseErr.message : String(parseErr) })
        return {
          content: `[Could not parse ${record.name} (${record.type}, ${record.size} bytes)]`,
          totalLines: 1,
        }
      }
    }

    if (!isReadableType(record.type)) {
      return {
        content: `[Binary file: ${record.name} (${record.type}, ${record.size} bytes). Cannot display as text.]`,
        totalLines: 1,
      }
    }

    if (record.size > MAX_TEXT_READ_BYTES) {
      return {
        content: `[File too large to display inline: ${record.name} (${record.size} bytes, limit ${MAX_TEXT_READ_BYTES})]`,
        totalLines: 1,
      }
    }

    const buffer = await downloadWorkspaceFile(record)
    const content = buffer.toString('utf-8')
    return { content, totalLines: content.split('\n').length }
  } catch (err) {
    logger.warn('Failed to read workspace file content', {
      path,
      fileName,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export async function executeVfsList(
  params: Record<string, unknown>,
  context: ExecutionContext
): Promise<ToolCallResult> {
  const path = params.path as string | undefined
  if (!path) {
    return { success: false, error: "Missing required parameter 'path'" }
  }

  const workspaceId = context.workspaceId
  if (!workspaceId) {
    return { success: false, error: 'No workspace context available' }
  }

  try {
    const vfs = await getOrMaterializeVFS(workspaceId, context.userId)
    const entries = vfs.list(path)
    logger.debug('vfs_list result', { path, entryCount: entries.length })
    return { success: true, output: { entries } }
  } catch (err) {
    logger.error('vfs_list failed', {
      path,
      error: err instanceof Error ? err.message : String(err),
    })
    return { success: false, error: err instanceof Error ? err.message : 'vfs_list failed' }
  }
}

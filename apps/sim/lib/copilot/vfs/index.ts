export type {
  DirEntry,
  GrepCountEntry,
  GrepMatch,
  GrepOptions,
  GrepOutputMode,
  ReadResult,
} from '@/lib/copilot/vfs/operations'
export {
  getOrMaterializeVFS,
  sanitizeName,
  WorkspaceVFS,
} from '@/lib/copilot/vfs/workspace-vfs'
export type { FileReadResult } from '@/lib/copilot/vfs/workspace-vfs'

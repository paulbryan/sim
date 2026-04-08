import type { WorkflowFolder } from '@/stores/folders/types'

/**
 * Checks whether a folder is locked, either directly or via ancestor cascade.
 * Walks up the folder tree via parentId; returns true if any ancestor (or self) is locked.
 */
export function isFolderEffectivelyLocked(
  folderId: string,
  folderMap: Record<string, WorkflowFolder>
): boolean {
  let current: WorkflowFolder | undefined = folderMap[folderId]
  while (current) {
    if (current.isLocked) return true
    current = current.parentId ? folderMap[current.parentId] : undefined
  }
  return false
}

/**
 * Checks whether a workflow is effectively locked (directly or via folder cascade).
 */
export function isWorkflowEffectivelyLocked(
  workflow: { isLocked?: boolean; folderId?: string | null },
  folderMap: Record<string, WorkflowFolder>
): boolean {
  if (workflow.isLocked) return true
  if (workflow.folderId) return isFolderEffectivelyLocked(workflow.folderId, folderMap)
  return false
}

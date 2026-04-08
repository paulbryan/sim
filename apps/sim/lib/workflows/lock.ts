/**
 * Minimal interface for folder lock checks — satisfied by both
 * client-side WorkflowFolder and plain DB rows.
 */
export interface LockableFolder {
  id: string
  parentId: string | null
  isLocked: boolean
}

/**
 * Checks whether a folder is locked, either directly or via ancestor cascade.
 * Walks up the folder tree via parentId; returns true if any ancestor (or self) is locked.
 * Pure function — works with an in-memory map (client or server).
 */
export function isFolderEffectivelyLocked(
  folderId: string,
  folderMap: Record<string, LockableFolder>
): boolean {
  const visited = new Set<string>()
  let current: LockableFolder | undefined = folderMap[folderId]
  while (current) {
    if (visited.has(current.id)) return false
    visited.add(current.id)
    if (current.isLocked) return true
    current = current.parentId ? folderMap[current.parentId] : undefined
  }
  return false
}

/**
 * Checks whether a workflow is effectively locked (directly or via folder cascade).
 * Pure function — works with an in-memory map (client or server).
 */
export function isWorkflowEffectivelyLocked(
  workflow: { isLocked?: boolean; folderId?: string | null },
  folderMap: Record<string, LockableFolder>
): boolean {
  if (workflow.isLocked) return true
  if (workflow.folderId) return isFolderEffectivelyLocked(workflow.folderId, folderMap)
  return false
}

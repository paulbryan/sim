import { db } from '@sim/db'
import { workflowFolder, workflow as workflowTable } from '@sim/db/schema'
import { eq } from 'drizzle-orm'

/**
 * DB-backed cascade lock check for folders.
 * Walks up the folder tree via DB queries, checking isLocked at each level.
 * Uses a visited set to guard against circular references.
 */
export async function isFolderEffectivelyLockedDb(folderId: string): Promise<boolean> {
  let currentId: string | null = folderId
  const visited = new Set<string>()

  while (currentId) {
    if (visited.has(currentId)) return false
    visited.add(currentId)

    const [folder] = await db
      .select({
        isLocked: workflowFolder.isLocked,
        parentId: workflowFolder.parentId,
      })
      .from(workflowFolder)
      .where(eq(workflowFolder.id, currentId))
      .limit(1)

    if (!folder) return false
    if (folder.isLocked) return true
    currentId = folder.parentId
  }

  return false
}

/**
 * DB-backed cascade lock check for workflows.
 * Checks the workflow's own isLocked flag, then walks its folder chain.
 */
export async function isWorkflowEffectivelyLockedDb(workflowId: string): Promise<boolean> {
  const [wf] = await db
    .select({
      isLocked: workflowTable.isLocked,
      folderId: workflowTable.folderId,
    })
    .from(workflowTable)
    .where(eq(workflowTable.id, workflowId))
    .limit(1)

  if (!wf) return false
  if (wf.isLocked) return true
  if (wf.folderId) return isFolderEffectivelyLockedDb(wf.folderId)
  return false
}

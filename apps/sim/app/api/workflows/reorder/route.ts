import { db } from '@sim/db'
import { workflow, workflowFolder } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq, inArray } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { isFolderEffectivelyLocked, isWorkflowEffectivelyLocked } from '@/lib/workflows/lock'
import { getUserEntityPermissions } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('WorkflowReorderAPI')

const ReorderSchema = z.object({
  workspaceId: z.string(),
  updates: z.array(
    z.object({
      id: z.string(),
      sortOrder: z.number().int().min(0),
      folderId: z.string().nullable().optional(),
    })
  ),
})

export async function PUT(req: NextRequest) {
  const requestId = generateRequestId()
  const auth = await checkSessionOrInternalAuth(req, { requireWorkflowId: false })
  if (!auth.success || !auth.userId) {
    logger.warn(`[${requestId}] Unauthorized reorder attempt`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = auth.userId

  try {
    const body = await req.json()
    const { workspaceId, updates } = ReorderSchema.parse(body)

    const permission = await getUserEntityPermissions(userId, 'workspace', workspaceId)
    if (!permission || permission === 'read') {
      logger.warn(
        `[${requestId}] User ${userId} lacks write permission for workspace ${workspaceId}`
      )
      return NextResponse.json({ error: 'Write access required' }, { status: 403 })
    }

    const workflowIds = updates.map((u) => u.id)
    const existingWorkflows = await db
      .select({
        id: workflow.id,
        workspaceId: workflow.workspaceId,
        isLocked: workflow.isLocked,
        folderId: workflow.folderId,
      })
      .from(workflow)
      .where(inArray(workflow.id, workflowIds))

    const validIds = new Set(
      existingWorkflows.filter((w) => w.workspaceId === workspaceId).map((w) => w.id)
    )

    const validUpdates = updates.filter((u) => validIds.has(u.id))

    if (validUpdates.length === 0) {
      return NextResponse.json({ error: 'No valid workflows to update' }, { status: 400 })
    }

    // Build folder map for cascade lock checks
    const allFolders = await db
      .select({
        id: workflowFolder.id,
        parentId: workflowFolder.parentId,
        isLocked: workflowFolder.isLocked,
      })
      .from(workflowFolder)
      .where(eq(workflowFolder.workspaceId, workspaceId))

    const folderMap: Record<string, { id: string; parentId: string | null; isLocked: boolean }> = {}
    for (const f of allFolders) {
      folderMap[f.id] = f
    }

    // Build workflow lookup for lock checks
    const workflowLookup = new Map(existingWorkflows.map((w) => [w.id, w]))

    // Block if any source workflow or destination folder is effectively locked
    for (const update of validUpdates) {
      const wf = workflowLookup.get(update.id)
      if (wf && isWorkflowEffectivelyLocked(wf, folderMap)) {
        return NextResponse.json(
          { error: 'Cannot move or reorder a locked workflow' },
          { status: 403 }
        )
      }
      if (update.folderId && isFolderEffectivelyLocked(update.folderId, folderMap)) {
        return NextResponse.json(
          { error: 'Cannot move workflows into a locked folder' },
          { status: 403 }
        )
      }
    }

    await db.transaction(async (tx) => {
      for (const update of validUpdates) {
        const updateData: Record<string, unknown> = {
          sortOrder: update.sortOrder,
          updatedAt: new Date(),
        }
        if (update.folderId !== undefined) {
          updateData.folderId = update.folderId
        }
        await tx.update(workflow).set(updateData).where(eq(workflow.id, update.id))
      }
    })

    logger.info(
      `[${requestId}] Reordered ${validUpdates.length} workflows in workspace ${workspaceId}`
    )

    return NextResponse.json({ success: true, updated: validUpdates.length })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`[${requestId}] Invalid reorder data`, { errors: error.errors })
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    logger.error(`[${requestId}] Error reordering workflows`, error)
    return NextResponse.json({ error: 'Failed to reorder workflows' }, { status: 500 })
  }
}

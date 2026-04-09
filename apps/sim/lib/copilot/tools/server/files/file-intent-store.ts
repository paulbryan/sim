import type { UserFile } from '@/lib/uploads/contexts/workspace/workspace-file-manager'

export type PendingFileIntent = {
  operation: 'append' | 'update' | 'patch'
  fileId: string
  workspaceId: string
  userId: string
  fileRecord: UserFile
  existingContent?: string
  edit?: {
    strategy: string
    search?: string
    replaceAll?: boolean
    mode?: string
    occurrence?: number
    before_anchor?: string
    after_anchor?: string
    anchor?: string
    start_anchor?: string
    end_anchor?: string
  }
  contentType?: string
  title?: string
  createdAt: number
}

const INTENT_TTL_MS = 60_000
const store = new Map<string, PendingFileIntent>()

function buildKey(workspaceId: string, fileId: string): string {
  return `${workspaceId}:${fileId}`
}

function cleanupStale(): void {
  const now = Date.now()
  for (const [key, intent] of store) {
    if (now - intent.createdAt > INTENT_TTL_MS) {
      store.delete(key)
    }
  }
}

export function storeFileIntent(
  workspaceId: string,
  fileId: string,
  intent: PendingFileIntent
): void {
  cleanupStale()
  store.set(buildKey(workspaceId, fileId), intent)
}

export function consumeFileIntent(
  workspaceId: string,
  fileId: string
): PendingFileIntent | undefined {
  const key = buildKey(workspaceId, fileId)
  const intent = store.get(key)
  if (intent) {
    store.delete(key)
  }
  return intent
}

export function consumeLatestFileIntent(workspaceId: string): PendingFileIntent | undefined {
  let latest: PendingFileIntent | undefined
  let latestKey: string | undefined
  for (const [key, intent] of store) {
    if (intent.workspaceId === workspaceId) {
      if (!latest || intent.createdAt > latest.createdAt) {
        latest = intent
        latestKey = key
      }
    }
  }
  if (latestKey) {
    store.delete(latestKey)
  }
  return latest
}

export function clearIntentsForWorkspace(workspaceId: string): number {
  let cleared = 0
  for (const [key, intent] of store) {
    if (intent.workspaceId === workspaceId) {
      store.delete(key)
      cleared++
    }
  }
  return cleared
}

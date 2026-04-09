/**
 * @vitest-environment node
 */

import { loggerMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getOrMaterializeVFS } = vi.hoisted(() => ({
  getOrMaterializeVFS: vi.fn(),
}))

const { readChatUpload } = vi.hoisted(() => ({
  readChatUpload: vi.fn(),
}))

vi.mock('@sim/logger', () => loggerMock)
vi.mock('@/lib/copilot/vfs', () => ({
  getOrMaterializeVFS,
}))
vi.mock('./upload-file-reader', () => ({
  readChatUpload,
  listChatUploads: vi.fn(),
}))

import { executeVfsGrep, executeVfsRead } from './vfs'

function makeVfs() {
  return {
    grep: vi.fn(),
    read: vi.fn(),
    readFileContent: vi.fn(),
    suggestSimilar: vi.fn().mockReturnValue([]),
  }
}

describe('vfs handlers oversize policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails oversized grep results with narrowing guidance', async () => {
    const vfs = makeVfs()
    vfs.grep.mockReturnValue([
      { path: 'files/a.txt', line: 1, content: 'a'.repeat(60_000) },
      { path: 'files/b.txt', line: 2, content: 'b'.repeat(60_000) },
    ])
    getOrMaterializeVFS.mockResolvedValue(vfs)

    const result = await executeVfsGrep(
      { pattern: 'foo', output_mode: 'content' },
      { userId: 'user-1', workflowId: 'wf-1', workspaceId: 'ws-1' }
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('smaller grep')
  })

  it('fails oversized read results with grep guidance', async () => {
    const vfs = makeVfs()
    vfs.read.mockReturnValue({ content: 'a'.repeat(100_001), totalLines: 1 })
    getOrMaterializeVFS.mockResolvedValue(vfs)

    const result = await executeVfsRead(
      { path: 'files/big.txt' },
      { userId: 'user-1', workflowId: 'wf-1', workspaceId: 'ws-1' }
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('Use grep')
  })

  it('fails file-backed oversized read placeholders with grep guidance', async () => {
    const vfs = makeVfs()
    vfs.read.mockReturnValue(null)
    vfs.readFileContent.mockResolvedValue({
      content: '[File too large to display inline: big.txt (6000000 bytes, limit 5242880)]',
      totalLines: 1,
    })
    getOrMaterializeVFS.mockResolvedValue(vfs)

    const result = await executeVfsRead(
      { path: 'files/big.txt' },
      { userId: 'user-1', workflowId: 'wf-1', workspaceId: 'ws-1' }
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('Use grep')
  })
})

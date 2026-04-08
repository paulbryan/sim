/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  isFolderEffectivelyLocked,
  isWorkflowEffectivelyLocked,
  type LockableFolder,
} from '@/lib/workflows/lock'

function folder(id: string, parentId: string | null, isLocked: boolean): LockableFolder {
  return { id, parentId, isLocked }
}

function buildMap(...folders: LockableFolder[]): Record<string, LockableFolder> {
  return Object.fromEntries(folders.map((f) => [f.id, f]))
}

describe('isFolderEffectivelyLocked', () => {
  it('returns false for an unlocked root folder', () => {
    const map = buildMap(folder('a', null, false))
    expect(isFolderEffectivelyLocked('a', map)).toBe(false)
  })

  it('returns true for a directly locked folder', () => {
    const map = buildMap(folder('a', null, true))
    expect(isFolderEffectivelyLocked('a', map)).toBe(true)
  })

  it('returns true when a parent is locked', () => {
    const map = buildMap(folder('root', null, true), folder('child', 'root', false))
    expect(isFolderEffectivelyLocked('child', map)).toBe(true)
  })

  it('returns true when a grandparent is locked', () => {
    const map = buildMap(
      folder('root', null, true),
      folder('mid', 'root', false),
      folder('leaf', 'mid', false)
    )
    expect(isFolderEffectivelyLocked('leaf', map)).toBe(true)
  })

  it('returns false when no ancestor is locked', () => {
    const map = buildMap(
      folder('root', null, false),
      folder('mid', 'root', false),
      folder('leaf', 'mid', false)
    )
    expect(isFolderEffectivelyLocked('leaf', map)).toBe(false)
  })

  it('returns false for a folder not in the map', () => {
    expect(isFolderEffectivelyLocked('nonexistent', {})).toBe(false)
  })

  it('handles missing parent gracefully', () => {
    const map = buildMap(folder('child', 'missing-parent', false))
    expect(isFolderEffectivelyLocked('child', map)).toBe(false)
  })

  it('detects lock in ancestor within circular chain', () => {
    const map = buildMap(folder('a', 'b', true), folder('b', 'a', false))
    expect(isFolderEffectivelyLocked('b', map)).toBe(true)
  })
})

describe('isWorkflowEffectivelyLocked', () => {
  it('returns false for an unlocked workflow without folder', () => {
    expect(isWorkflowEffectivelyLocked({ isLocked: false }, {})).toBe(false)
  })

  it('returns true for a directly locked workflow', () => {
    expect(isWorkflowEffectivelyLocked({ isLocked: true }, {})).toBe(true)
  })

  it('returns true when the workflow folder is locked', () => {
    const map = buildMap(folder('f1', null, true))
    expect(isWorkflowEffectivelyLocked({ isLocked: false, folderId: 'f1' }, map)).toBe(true)
  })

  it('returns true when a parent folder in the chain is locked', () => {
    const map = buildMap(folder('root', null, true), folder('child', 'root', false))
    expect(isWorkflowEffectivelyLocked({ isLocked: false, folderId: 'child' }, map)).toBe(true)
  })

  it('returns false when workflow and folder chain are all unlocked', () => {
    const map = buildMap(folder('root', null, false), folder('child', 'root', false))
    expect(isWorkflowEffectivelyLocked({ isLocked: false, folderId: 'child' }, map)).toBe(false)
  })

  it('returns false when folderId is null', () => {
    expect(isWorkflowEffectivelyLocked({ isLocked: false, folderId: null }, {})).toBe(false)
  })

  it('returns false when folderId points to nonexistent folder', () => {
    expect(isWorkflowEffectivelyLocked({ isLocked: false, folderId: 'gone' }, {})).toBe(false)
  })

  it('handles undefined isLocked as false', () => {
    expect(isWorkflowEffectivelyLocked({}, {})).toBe(false)
  })
})

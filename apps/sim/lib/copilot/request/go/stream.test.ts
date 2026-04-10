/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildPreviewContentUpdate,
  decodeJsonStringPrefix,
  extractEditContent,
} from '@/lib/copilot/request/go/stream'

describe('copilot go stream helpers', () => {
  it('decodes complete escapes and stops at incomplete unicode escapes', () => {
    expect(decodeJsonStringPrefix('hello\\nworld')).toBe('hello\nworld')
    expect(decodeJsonStringPrefix('emoji \\u263A')).toBe('emoji ☺')
    expect(decodeJsonStringPrefix('partial \\u26')).toBe('partial ')
  })

  it('extracts the streamed edit_content prefix from partial JSON', () => {
    expect(extractEditContent('{"content":"hello\\nwor')).toBe('hello\nwor')
    expect(extractEditContent('{"content":"tab\\tvalue"}')).toBe('tab\tvalue')
  })

  it('emits full snapshots for append (sidebar viewer uses replace mode; no delta merge)', () => {
    expect(buildPreviewContentUpdate('hello', 'hello world', 100, 200, 'append')).toEqual({
      content: 'hello world',
      contentMode: 'snapshot',
      lastSnapshotAt: 200,
    })
  })

  it('emits deltas for update when the preview extends the previous text', () => {
    expect(buildPreviewContentUpdate('hello', 'hello world', 100, 200, 'update')).toEqual({
      content: ' world',
      contentMode: 'delta',
      lastSnapshotAt: 100,
    })
  })

  it('falls back to snapshots for patches and divergent content', () => {
    expect(buildPreviewContentUpdate('hello', 'goodbye', 100, 200, 'update')).toEqual({
      content: 'goodbye',
      contentMode: 'snapshot',
      lastSnapshotAt: 200,
    })

    expect(buildPreviewContentUpdate('hello', 'hello world', 100, 200, 'patch')).toEqual({
      content: 'hello world',
      contentMode: 'snapshot',
      lastSnapshotAt: 200,
    })
  })
})

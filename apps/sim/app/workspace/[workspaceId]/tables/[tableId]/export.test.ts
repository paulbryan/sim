import { createTableColumn, createTableRow } from '@sim/testing'
import { describe, expect, it } from 'vitest'
import { buildTableCsv, formatTableExportValue } from './export'

describe('table export utils', () => {
  it('formats exported values using table display conventions', () => {
    expect(formatTableExportValue('2026-04-03', { name: 'date', type: 'date' })).toBe('04/03/2026')
    expect(formatTableExportValue({ nested: true }, { name: 'payload', type: 'json' })).toBe(
      '{"nested":true}'
    )
    expect(formatTableExportValue(null, { name: 'empty', type: 'string' })).toBe('')
  })

  it('builds CSV using visible columns and escaped values', () => {
    const columns = [
      createTableColumn({ name: 'name', type: 'string' }),
      createTableColumn({ name: 'date', type: 'date' }),
      createTableColumn({ name: 'notes', type: 'json' }),
    ]

    const rows = [
      createTableRow({
        id: 'row_1',
        position: 0,
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
        data: {
          name: 'Ada "Lovelace"',
          date: '2026-04-03',
          notes: { text: 'line 1\nline 2' },
        },
      }),
    ]

    expect(buildTableCsv(columns, rows)).toBe(
      'name,date,notes\r\n"Ada ""Lovelace""",04/03/2026,"{""text"":""line 1\\nline 2""}"'
    )
  })
})

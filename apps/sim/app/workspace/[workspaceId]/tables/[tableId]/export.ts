import type { ColumnDefinition, TableRow } from '@/lib/table'
import { storageToDisplay } from './utils'

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function formatTableExportValue(value: unknown, column: ColumnDefinition): string {
  if (value === null || value === undefined) return ''

  switch (column.type) {
    case 'date':
      return storageToDisplay(String(value))
    case 'json':
      return typeof value === 'string' ? value : safeJsonStringify(value)
    default:
      return String(value)
  }
}

export function escapeCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function buildTableCsv(columns: ColumnDefinition[], rows: TableRow[]): string {
  const headerRow = columns.map((column) => escapeCsvCell(column.name)).join(',')
  const dataRows = rows.map((row) =>
    columns
      .map((column) => escapeCsvCell(formatTableExportValue(row.data[column.name], column)))
      .join(',')
  )

  return [headerRow, ...dataRows].join('\r\n')
}

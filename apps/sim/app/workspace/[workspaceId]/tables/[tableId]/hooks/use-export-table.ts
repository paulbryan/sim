'use client'

import { useCallback, useState } from 'react'
import { usePostHog } from 'posthog-js/react'
import { toast } from '@/components/emcn'
import { downloadFile, sanitizePathSegment } from '@/lib/core/utils/file-download'
import { captureEvent } from '@/lib/posthog/client'
import type { ColumnDefinition } from '@/lib/table'
import { buildTableCsv } from '@/app/workspace/[workspaceId]/tables/[tableId]/export'
import type { QueryOptions } from '@/app/workspace/[workspaceId]/tables/[tableId]/types'
import { fetchAllTableRows } from '@/hooks/queries/tables'

interface UseExportTableParams {
  workspaceId: string
  tableId: string
  tableName?: string | null
  columns: ColumnDefinition[]
  queryOptions: QueryOptions
  canExport: boolean
}

export function useExportTable({
  workspaceId,
  tableId,
  tableName,
  columns,
  queryOptions,
  canExport,
}: UseExportTableParams) {
  const posthog = usePostHog()
  const [isExporting, setIsExporting] = useState(false)

  const handleExportTable = useCallback(async () => {
    if (!canExport || !workspaceId || !tableId || isExporting) {
      return
    }

    setIsExporting(true)

    try {
      const { rows } = await fetchAllTableRows({
        workspaceId,
        tableId,
        filter: queryOptions.filter,
        sort: queryOptions.sort,
      })

      const filename = `${sanitizePathSegment(tableName?.trim() || 'table')}.csv`
      const csvContent = buildTableCsv(columns, rows)

      downloadFile(csvContent, filename, 'text/csv;charset=utf-8;')

      captureEvent(posthog, 'table_exported', {
        workspace_id: workspaceId,
        table_id: tableId,
        row_count: rows.length,
        column_count: columns.length,
        has_filter: Boolean(queryOptions.filter),
        has_sort: Boolean(queryOptions.sort),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export table', {
        duration: 5000,
      })
    } finally {
      setIsExporting(false)
    }
  }, [
    canExport,
    columns,
    isExporting,
    posthog,
    queryOptions.filter,
    queryOptions.sort,
    tableId,
    tableName,
    workspaceId,
  ])

  return {
    isExporting,
    handleExportTable,
  }
}

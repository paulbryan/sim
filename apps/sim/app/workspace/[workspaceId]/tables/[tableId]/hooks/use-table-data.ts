import type { TableDefinition, TableRow } from '@/lib/table'
import { TABLE_LIMITS } from '@/lib/table/constants'
import type { QueryOptions } from '@/app/workspace/[workspaceId]/tables/[tableId]/types'
import { useTable, useTableRows } from '@/hooks/queries/tables'

interface UseTableDataParams {
  workspaceId: string
  tableId: string
  queryOptions: QueryOptions
}

interface UseTableDataReturn {
  tableData: TableDefinition | undefined
  isLoadingTable: boolean
  rows: TableRow[]
  isLoadingRows: boolean
  refetchRows: () => void
}

export function useTableData({
  workspaceId,
  tableId,
  queryOptions,
}: UseTableDataParams): UseTableDataReturn {
  const { data: tableData, isLoading: isLoadingTable } = useTable(workspaceId, tableId)

  const {
    data: rowsData,
    isLoading: isLoadingRows,
    refetch: refetchRows,
  } = useTableRows({
    workspaceId,
    tableId,
    limit: TABLE_LIMITS.MAX_QUERY_LIMIT,
    offset: 0,
    filter: queryOptions.filter,
    sort: queryOptions.sort,
    enabled: Boolean(workspaceId && tableId),
  })

  const rows = (rowsData?.rows || []) as TableRow[]

  return {
    tableData,
    isLoadingTable,
    rows,
    isLoadingRows,
    refetchRows,
  }
}

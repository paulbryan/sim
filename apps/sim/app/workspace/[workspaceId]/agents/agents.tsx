'use client'

import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { createLogger } from '@sim/logger'
import { useParams, useRouter } from 'next/navigation'
import { AgentIcon } from '@/components/icons'
import { AgentContextMenu } from '@/app/workspace/[workspaceId]/agents/components/agent-context-menu'
import { AgentListContextMenu } from '@/app/workspace/[workspaceId]/agents/components/agent-list-context-menu'
import type { ResourceColumn, ResourceRow } from '@/app/workspace/[workspaceId]/components'
import {
  InlineRenameInput,
  ownerCell,
  Resource,
  timeCell,
} from '@/app/workspace/[workspaceId]/components'
import { useUserPermissionsContext } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import { useContextMenu } from '@/app/workspace/[workspaceId]/w/components/sidebar/hooks'
import {
  useAgentsList,
  useCreateAgent,
  useDeleteAgent,
  useUpdateAgent,
} from '@/hooks/queries/agents'
import { useWorkspaceMembersQuery } from '@/hooks/queries/workspace'
import { useInlineRename } from '@/hooks/use-inline-rename'

const logger = createLogger('Agents')

const COLUMNS: ResourceColumn[] = [
  { id: 'name', header: 'Name' },
  { id: 'model', header: 'Model' },
  { id: 'status', header: 'Status' },
  { id: 'created', header: 'Created' },
  { id: 'owner', header: 'Owner' },
  { id: 'updated', header: 'Last Updated' },
]

export function Agents() {
  const params = useParams()
  const router = useRouter()
  const workspaceId = params.workspaceId as string

  const { data: agents = [], isLoading } = useAgentsList(workspaceId)
  const { data: members } = useWorkspaceMembersQuery(workspaceId)
  const { mutateAsync: createAgent, isPending: isCreating } = useCreateAgent()
  const { mutateAsync: deleteAgent } = useDeleteAgent()
  const { mutateAsync: updateAgent } = useUpdateAgent()
  const userPermissions = useUserPermissionsContext()

  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery)

  const listRename = useInlineRename({
    onSave: (agentId, name) => updateAgent({ agentId, name }),
  })

  const {
    isOpen: isListContextMenuOpen,
    position: listContextMenuPosition,
    handleContextMenu: handleListContextMenu,
    closeMenu: closeListContextMenu,
  } = useContextMenu()

  const {
    isOpen: isRowContextMenuOpen,
    position: rowContextMenuPosition,
    handleContextMenu: handleRowCtxMenu,
    closeMenu: closeRowContextMenu,
  } = useContextMenu()

  const handleContentContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        target.closest('[data-resource-row]') ||
        target.closest('button, input, a, [role="button"]')
      )
        return
      handleListContextMenu(e)
    },
    [handleListContextMenu]
  )

  const handleRowClick = useCallback(
    (rowId: string) => {
      if (isRowContextMenuOpen || listRename.editingId === rowId) return
      router.push(`/workspace/${workspaceId}/agents/${rowId}`)
    },
    [isRowContextMenuOpen, listRename.editingId, router, workspaceId]
  )

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent, rowId: string) => {
      setActiveAgentId(rowId)
      handleRowCtxMenu(e)
    },
    [handleRowCtxMenu]
  )

  const handleDelete = useCallback(async () => {
    if (!activeAgentId) return
    setIsDeleting(true)
    try {
      await deleteAgent({ agentId: activeAgentId })
      closeRowContextMenu()
      setActiveAgentId(null)
    } catch (error) {
      logger.error('Failed to delete agent', { error })
    } finally {
      setIsDeleting(false)
    }
  }, [activeAgentId, deleteAgent, closeRowContextMenu])

  const handleCreateAgent = useCallback(async () => {
    const existingNames = new Set(agents.map((a) => a.name))
    let counter = 1
    while (existingNames.has(`Agent ${counter}`)) counter++
    const name = `Agent ${counter}`
    try {
      const agent = await createAgent({ workspaceId, name })
      router.push(`/workspace/${workspaceId}/agents/${agent.id}`)
    } catch (error) {
      logger.error('Failed to create agent', { error })
    }
  }, [agents, createAgent, router, workspaceId])

  const handleRename = useCallback(() => {
    if (!activeAgentId) return
    const agent = agents.find((a) => a.id === activeAgentId)
    if (agent) listRename.startRename(activeAgentId, agent.name)
    closeRowContextMenu()
  }, [activeAgentId, agents, listRename, closeRowContextMenu])

  const rows: ResourceRow[] = useMemo(() => {
    const filtered = deferredSearch
      ? agents.filter((a) => a.name.toLowerCase().includes(deferredSearch.toLowerCase()))
      : agents

    return filtered.map((agent) => ({
      id: agent.id,
      cells: {
        name: {
          icon: <AgentIcon className='h-[14px] w-[14px]' />,
          label: agent.name,
          content:
            listRename.editingId === agent.id ? (
              <span className='flex min-w-0 items-center gap-[12px] font-medium text-[14px] text-[var(--text-body)]'>
                <span className='flex-shrink-0 text-[var(--text-icon)]'>
                  <AgentIcon className='h-[14px] w-[14px]' />
                </span>
                <InlineRenameInput
                  value={listRename.editValue}
                  onChange={listRename.setEditValue}
                  onSubmit={listRename.submitRename}
                  onCancel={listRename.cancelRename}
                />
              </span>
            ) : undefined,
        },
        model: { label: agent.config.model ?? '—' },
        status: { label: agent.isDeployed ? 'Deployed' : 'Draft' },
        created: timeCell(agent.createdAt),
        owner: ownerCell(agent.createdBy, members),
        updated: timeCell(agent.updatedAt),
      },
      sortValues: {
        created: -new Date(agent.createdAt).getTime(),
        updated: -new Date(agent.updatedAt).getTime(),
      },
    }))
  }, [agents, deferredSearch, members, listRename.editingId, listRename.editValue])

  return (
    <>
      <Resource
        icon={AgentIcon}
        title='Agents'
        create={{
          label: 'New agent',
          onClick: handleCreateAgent,
          disabled: userPermissions.canEdit !== true || isCreating,
        }}
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: 'Search agents…',
        }}
        defaultSort='created'
        columns={COLUMNS}
        rows={rows}
        onRowClick={handleRowClick}
        onRowContextMenu={handleRowContextMenu}
        isLoading={isLoading}
        onContextMenu={handleContentContextMenu}
      />

      <AgentListContextMenu
        isOpen={isListContextMenuOpen}
        position={listContextMenuPosition}
        onClose={closeListContextMenu}
        onAddAgent={handleCreateAgent}
        disableAdd={userPermissions.canEdit !== true || isCreating}
      />

      {activeAgentId && (
        <AgentContextMenu
          isOpen={isRowContextMenuOpen}
          position={rowContextMenuPosition}
          onClose={closeRowContextMenu}
          onOpen={() => {
            router.push(`/workspace/${workspaceId}/agents/${activeAgentId}`)
            closeRowContextMenu()
          }}
          onRename={handleRename}
          onDelete={handleDelete}
          isDeleting={isDeleting}
          disableEdit={userPermissions.canEdit !== true}
        />
      )}
    </>
  )
}

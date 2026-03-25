'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLogger } from '@sim/logger'
import { useRouter } from 'next/navigation'
import { Pencil, Trash } from '@/components/emcn/icons'
import { AgentIcon } from '@/components/icons'
import type { AgentConfig } from '@/lib/agents/types'
import { AgentConfigPanel } from '@/app/workspace/[workspaceId]/agents/[agentId]/components/agent-config/agent-config-panel'
import { AgentTestPanel } from '@/app/workspace/[workspaceId]/agents/[agentId]/components/agent-test-panel'
import { DeployModal } from '@/app/workspace/[workspaceId]/agents/[agentId]/components/deploy-modal'
import type { BreadcrumbItem } from '@/app/workspace/[workspaceId]/components'
import { ResourceHeader } from '@/app/workspace/[workspaceId]/components'
import { useAgent, useDeleteAgent, useUpdateAgent } from '@/hooks/queries/agents'
import { useInlineRename } from '@/hooks/use-inline-rename'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'

const logger = createLogger('AgentDetail')

const AUTOSAVE_DELAY_MS = 1000

interface AgentDetailProps {
  agentId: string
  workspaceId: string
}

export function AgentDetail({ agentId, workspaceId }: AgentDetailProps) {
  const router = useRouter()
  const { data: agent, isLoading } = useAgent(agentId)
  const { mutateAsync: updateAgent } = useUpdateAgent()
  const { mutateAsync: deleteAgent } = useDeleteAgent()

  const [localConfig, setLocalConfig] = useState<AgentConfig>({})
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitializedRef = useRef(false)

  // SubBlockStore.setValue reads activeWorkflowId from the workflow registry and no-ops when null.
  // Set the agentId as the active "workflow" so tool sub-block params (credentials, etc.) persist.
  useEffect(() => {
    useWorkflowRegistry.setState({ activeWorkflowId: agentId })
    return () => {
      if (useWorkflowRegistry.getState().activeWorkflowId === agentId) {
        useWorkflowRegistry.setState({ activeWorkflowId: null })
      }
    }
  }, [agentId])

  useEffect(() => {
    if (agent && !isInitializedRef.current) {
      setLocalConfig(agent.config ?? {})
      isInitializedRef.current = true
    }
  }, [agent])

  const agentRename = useInlineRename({
    onSave: (id, name) => updateAgent({ agentId: id, name }),
  })

  const scheduleSave = useCallback(
    (updatedConfig: AgentConfig) => {
      setSaveStatus('unsaved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        saveTimerRef.current = null
        setSaveStatus('saving')
        try {
          await updateAgent({ agentId, config: updatedConfig })
          setSaveStatus('saved')
        } catch (error) {
          logger.error('Failed to auto-save agent', { error })
          setSaveStatus('unsaved')
        }
      }, AUTOSAVE_DELAY_MS)
    },
    [agentId, updateAgent]
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleConfigChange = useCallback(
    (patch: Partial<AgentConfig>) => {
      setLocalConfig((prev) => {
        const next = { ...prev, ...patch }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave]
  )

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      await deleteAgent({ agentId })
      router.push(`/workspace/${workspaceId}/agents`)
    } catch (error) {
      logger.error('Failed to delete agent', { error })
      setIsDeleting(false)
    }
  }, [agentId, deleteAgent, router, workspaceId])

  const currentName = agent?.name ?? ''

  const breadcrumbs = useMemo<BreadcrumbItem[]>(
    () => [
      { label: 'Agents', onClick: () => router.push(`/workspace/${workspaceId}/agents`) },
      {
        label: currentName || '…',
        editing:
          agentRename.editingId === agentId
            ? {
                isEditing: true,
                value: agentRename.editValue,
                onChange: agentRename.setEditValue,
                onSubmit: agentRename.submitRename,
                onCancel: agentRename.cancelRename,
              }
            : undefined,
        dropdownItems: [
          {
            label: 'Rename',
            icon: Pencil,
            onClick: () => agentRename.startRename(agentId, currentName),
          },
          {
            label: 'Delete',
            icon: Trash,
            onClick: handleDelete,
            disabled: isDeleting,
          },
        ],
      },
    ],
    [
      agentId,
      currentName,
      agentRename.editingId,
      agentRename.editValue,
      agentRename.setEditValue,
      agentRename.submitRename,
      agentRename.cancelRename,
      agentRename.startRename,
      handleDelete,
      isDeleting,
      router,
      workspaceId,
    ]
  )

  const saveStatusLabel =
    saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved changes' : undefined

  if (isLoading) {
    return (
      <div className='flex h-full flex-1 flex-col overflow-hidden bg-[var(--surface-1)]'>
        <ResourceHeader icon={AgentIcon} breadcrumbs={[{ label: 'Agents' }, { label: '…' }]} />
        <div className='flex flex-1 items-center justify-center'>
          <span className='text-[14px] text-[var(--text-muted)]'>Loading…</span>
        </div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className='flex h-full flex-1 flex-col overflow-hidden bg-[var(--surface-1)]'>
        <ResourceHeader
          icon={AgentIcon}
          breadcrumbs={[
            { label: 'Agents', onClick: () => router.push(`/workspace/${workspaceId}/agents`) },
            { label: 'Not found' },
          ]}
        />
        <div className='flex flex-1 items-center justify-center'>
          <span className='text-[14px] text-[var(--text-muted)]'>Agent not found.</span>
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-full flex-1 flex-col overflow-hidden bg-[var(--surface-1)]'>
      <ResourceHeader
        icon={AgentIcon}
        breadcrumbs={breadcrumbs}
        actions={[
          ...(saveStatusLabel
            ? [{ label: saveStatusLabel, onClick: () => {}, disabled: true }]
            : []),
          { label: 'Deploy', onClick: () => setIsDeployModalOpen(true) },
        ]}
      />

      <div className='flex min-h-0 flex-1 overflow-hidden'>
        <div className='flex w-[400px] min-w-[320px] flex-shrink-0 flex-col overflow-y-auto border-[var(--border-1)] border-r'>
          <AgentConfigPanel
            config={localConfig}
            agentId={agentId}
            workspaceId={workspaceId}
            onConfigChange={handleConfigChange}
          />
        </div>

        <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
          <AgentTestPanel agentId={agentId} />
        </div>
      </div>

      <DeployModal
        agentId={agentId}
        workspaceId={workspaceId}
        isDeployed={agent.isDeployed}
        open={isDeployModalOpen}
        onOpenChange={setIsDeployModalOpen}
      />
    </div>
  )
}

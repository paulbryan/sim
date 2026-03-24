'use client'

import { useCallback, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useParams } from 'next/navigation'
import { ReactFlowProvider } from 'reactflow'
import {
  Combobox,
  type ComboboxOptionGroup,
  Popover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
} from '@/components/emcn'
import { Plus, Wrench, X } from '@/components/emcn/icons'
import { McpIcon, WorkflowIcon } from '@/components/icons'
import type { ToolInput } from '@/lib/agents/types'
import { cn } from '@/lib/core/utils/cn'
import { McpServerFormModal } from '@/app/workspace/[workspaceId]/settings/components/mcp/components/mcp-server-form-modal/mcp-server-form-modal'
import {
  type CustomTool,
  CustomToolModal,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/tool-input/components/custom-tool-modal/custom-tool-modal'
import { ToolSubBlockRenderer } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/tool-input/components/tools/sub-block-renderer'
import { getAllBlocks } from '@/blocks'
import { BUILT_IN_TOOL_TYPES } from '@/blocks/utils'
import { type McpToolForUI, useMcpTools } from '@/hooks/mcp/use-mcp-tools'
import { useCustomTools } from '@/hooks/queries/custom-tools'
import { useAllowedMcpDomains, useCreateMcpServer, useMcpServers } from '@/hooks/queries/mcp'
import { useWorkflows } from '@/hooks/queries/workflows'
import { useAvailableEnvVarKeys } from '@/hooks/use-available-env-vars'
import { getProviderFromModel, supportsToolUsageControl } from '@/providers/utils'
import { getSubBlocksForToolInput, getToolParametersConfig } from '@/tools/params'

/** Returns true if a block type has more than one tool operation. */
function hasMultipleOperations(blockType: string): boolean {
  const block = getAllBlocks().find((b) => b.type === blockType)
  return (block?.tools?.access?.length || 0) > 1
}

/** Returns the available operation options for a multi-operation block. */
function getOperationOptions(blockType: string): { label: string; id: string }[] {
  const block = getAllBlocks().find((b) => b.type === blockType)
  if (!block?.tools?.access) return []

  const opSubBlock = block.subBlocks.find((sb) => sb.id === 'operation')
  if (opSubBlock?.type === 'dropdown' && Array.isArray(opSubBlock.options)) {
    return opSubBlock.options as { label: string; id: string }[]
  }

  return block.tools.access.map((toolId) => {
    const params = getToolParametersConfig(toolId)
    return { id: toolId, label: params?.toolConfig?.name || toolId }
  })
}

/** Returns the concrete toolId for a given block type and optional operation. */
function getToolIdForOperation(blockType: string, operation?: string): string | undefined {
  const block = getAllBlocks().find((b) => b.type === blockType)
  if (!block?.tools?.access) return undefined
  if (block.tools.access.length === 1) return block.tools.access[0]
  if (operation && block.tools?.config?.tool) {
    try {
      return block.tools.config.tool({ operation })
    } catch {}
  }
  if (operation && block.tools.access.includes(operation)) return operation
  return block.tools.access[0]
}

interface AgentToolInputProps {
  workspaceId: string
  selectedTools: ToolInput[]
  model?: string
  onChange: (tools: ToolInput[]) => void
}

export function AgentToolInput({
  workspaceId,
  selectedTools,
  model,
  onChange,
}: AgentToolInputProps) {
  const params = useParams()
  const agentId = (params?.agentId as string) || 'agent'

  const [activeMcpServerId, setActiveMcpServerId] = useState<string | null>(null)
  const [showCustomToolModal, setShowCustomToolModal] = useState(false)
  const [showMcpModal, setShowMcpModal] = useState(false)
  const [usageControlIndex, setUsageControlIndex] = useState<number | null>(null)

  const { data: customTools = [] } = useCustomTools(workspaceId)
  const { mcpTools } = useMcpTools(workspaceId)
  const { data: servers = [] } = useMcpServers(workspaceId)
  const { data: workflowsList = [] } = useWorkflows(workspaceId, { syncRegistry: false })
  const createMcpServer = useCreateMcpServer()
  const { data: allowedMcpDomains = null } = useAllowedMcpDomains()
  const availableEnvVars = useAvailableEnvVarKeys(workspaceId)

  const toolBlocks = useMemo(
    () =>
      getAllBlocks().filter(
        (block) =>
          !block.hideFromToolbar &&
          (block.category === 'tools' ||
            block.type === 'api' ||
            block.type === 'webhook_request' ||
            block.type === 'knowledge' ||
            block.type === 'function' ||
            block.type === 'table') &&
          block.type !== 'evaluator' &&
          block.type !== 'mcp' &&
          block.type !== 'file'
      ),
    []
  )

  const handleSelectBlock = useCallback(
    (block: ReturnType<typeof getAllBlocks>[number]) => {
      const hasOps = hasMultipleOperations(block.type)
      const ops = hasOps ? getOperationOptions(block.type) : []
      const defaultOp = ops.length > 0 ? ops[0].id : undefined
      const toolId = getToolIdForOperation(block.type, defaultOp) || ''
      const newTool: ToolInput = {
        type: block.type,
        title: block.name,
        toolId,
        params: {},
        operation: defaultOp,
        isExpanded: true,
        usageControl: 'auto',
      }
      onChange([...selectedTools.map((t) => ({ ...t, isExpanded: false })), newTool])
    },
    [selectedTools, onChange]
  )

  const handleSelectCustomTool = useCallback(
    (tool: { id: string; title: string }) => {
      const newTool: ToolInput = {
        type: 'custom-tool',
        title: tool.title,
        customToolId: tool.id,
        usageControl: 'auto',
      }
      onChange([...selectedTools, newTool])
    },
    [selectedTools, onChange]
  )

  const handleSelectMcpTool = useCallback(
    (mcpTool: McpToolForUI) => {
      const newTool: ToolInput = {
        type: 'mcp',
        title: mcpTool.name,
        toolId: mcpTool.id,
        params: {
          serverId: mcpTool.serverId,
          toolName: mcpTool.name,
          serverName: mcpTool.serverName,
        },
        schema: mcpTool.inputSchema,
        usageControl: 'auto',
      }
      onChange([...selectedTools, newTool])
    },
    [selectedTools, onChange]
  )

  const handleSelectWorkflow = useCallback(
    (workflow: { id: string; name: string }) => {
      const alreadySelected = selectedTools.some(
        (t) => t.type === 'workflow_input' && t.params?.workflowId === workflow.id
      )
      if (alreadySelected) return
      const newTool: ToolInput = {
        type: 'workflow_input',
        title: workflow.name,
        toolId: 'workflow_executor',
        params: { workflowId: workflow.id },
        isExpanded: true,
        usageControl: 'auto',
      }
      onChange([...selectedTools.map((t) => ({ ...t, isExpanded: false })), newTool])
    },
    [selectedTools, onChange]
  )

  const handleRemove = useCallback(
    (index: number) => {
      const next = [...selectedTools]
      next.splice(index, 1)
      onChange(next)
    },
    [selectedTools, onChange]
  )

  const handleParamChange = useCallback(
    (index: number, paramId: string, value: string) => {
      onChange(
        selectedTools.map((t, i) =>
          i === index ? { ...t, params: { ...(t.params || {}), [paramId]: value } } : t
        )
      )
    },
    [selectedTools, onChange]
  )

  const handleOperationChange = useCallback(
    (index: number, operation: string) => {
      const tool = selectedTools[index]
      const newToolId = getToolIdForOperation(tool.type ?? '', operation) || ''
      onChange(
        selectedTools.map((t, i) =>
          i === index ? { ...t, operation, toolId: newToolId, params: {} } : t
        )
      )
    },
    [selectedTools, onChange]
  )

  const handleUsageControlChange = useCallback(
    (index: number, value: 'auto' | 'force' | 'none') => {
      onChange(selectedTools.map((t, i) => (i === index ? { ...t, usageControl: value } : t)))
    },
    [selectedTools, onChange]
  )

  const toggleExpansion = useCallback(
    (index: number) => {
      onChange(selectedTools.map((t, i) => (i === index ? { ...t, isExpanded: !t.isExpanded } : t)))
    },
    [selectedTools, onChange]
  )

  const selectedCustomIds = useMemo(
    () => new Set(selectedTools.filter((t) => t.type === 'custom-tool').map((t) => t.customToolId)),
    [selectedTools]
  )

  const selectedMcpKeys = useMemo(
    () =>
      new Set(
        selectedTools
          .filter((t) => t.type === 'mcp')
          .map((t) => `${t.params?.serverId ?? ''}:${t.params?.toolName ?? ''}`)
      ),
    [selectedTools]
  )

  const showUsageControl = useMemo(() => {
    if (!model) return false
    const provider = getProviderFromModel(model)
    return Boolean(provider && supportsToolUsageControl(provider))
  }, [model])

  const toolGroups = useMemo((): ComboboxOptionGroup[] => {
    if (activeMcpServerId) {
      const server = servers.find((s) => s.id === activeMcpServerId)
      const serverTools = mcpTools.filter(
        (t) => t.serverId === activeMcpServerId && !selectedMcpKeys.has(`${t.serverId}:${t.name}`)
      )

      const groups: ComboboxOptionGroup[] = [
        {
          items: [
            {
              label: 'Back',
              value: 'action-back',
              icon: ChevronLeft,
              onSelect: () => setActiveMcpServerId(null),
              keepOpen: true,
            },
            ...(serverTools.length > 0
              ? [
                  {
                    label: `Use all ${serverTools.length} tool${serverTools.length !== 1 ? 's' : ''}`,
                    value: 'action-use-all',
                    icon: McpIcon,
                    onSelect: () => {
                      const newTools: ToolInput[] = serverTools.map((t) => ({
                        type: 'mcp',
                        title: t.name,
                        toolId: t.id,
                        params: {
                          serverId: t.serverId,
                          toolName: t.name,
                          serverName: t.serverName,
                        },
                        schema: t.inputSchema,
                        usageControl: 'auto' as const,
                      }))
                      onChange([...selectedTools, ...newTools])
                      setActiveMcpServerId(null)
                    },
                  },
                ]
              : []),
          ],
        },
      ]

      if (serverTools.length > 0) {
        groups.push({
          section: server?.name ?? activeMcpServerId,
          items: serverTools.map((tool) => ({
            label: tool.name,
            value: `mcp:${tool.serverId}:${tool.name}`,
            icon: McpIcon,
            onSelect: () => {
              handleSelectMcpTool(tool)
              setActiveMcpServerId(null)
            },
          })),
        })
      }

      return groups
    }

    const groups: ComboboxOptionGroup[] = []

    groups.push({
      items: [
        {
          label: 'Create custom tool',
          value: 'action-create-tool',
          icon: Plus,
          onSelect: () => setShowCustomToolModal(true),
        },
        {
          label: 'Add MCP server',
          value: 'action-add-mcp',
          icon: Plus,
          onSelect: () => setShowMcpModal(true),
        },
      ],
    })

    const availableCustom = customTools.filter((t) => !selectedCustomIds.has(t.id))
    if (availableCustom.length > 0) {
      groups.push({
        section: 'Custom tools',
        items: availableCustom.map((t) => ({
          label: t.title,
          value: `custom:${t.id}`,
          icon: Wrench,
          onSelect: () => handleSelectCustomTool(t),
        })),
      })
    }

    const enabledServers = servers.filter((s) => s.enabled)
    if (enabledServers.length > 0) {
      groups.push({
        section: 'MCP servers',
        items: enabledServers.map((server) => {
          const count = mcpTools.filter((t) => t.serverId === server.id).length
          return {
            label: server.name,
            value: `server:${server.id}`,
            icon: McpIcon,
            suffixElement: (
              <div className='flex items-center gap-[3px] text-[11px] text-[var(--text-muted)]'>
                <span>{count}</span>
                <ChevronRight className='h-[9px] w-[9px]' />
              </div>
            ),
            onSelect: () => setActiveMcpServerId(server.id),
            keepOpen: true,
          }
        }),
      })
    }

    const builtInBlocks = toolBlocks.filter((b) => BUILT_IN_TOOL_TYPES.has(b.type))
    if (builtInBlocks.length > 0) {
      groups.push({
        section: 'Tools',
        items: builtInBlocks.map((block) => ({
          label: block.name,
          value: `block:${block.type}`,
          iconElement: (
            <div
              className='flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center rounded-[3px]'
              style={{ backgroundColor: block.bgColor }}
            >
              <block.icon className='h-[9px] w-[9px] text-white' />
            </div>
          ),
          onSelect: () => handleSelectBlock(block),
        })),
      })
    }

    const integrationBlocks = toolBlocks.filter((b) => !BUILT_IN_TOOL_TYPES.has(b.type))
    if (integrationBlocks.length > 0) {
      groups.push({
        section: 'Integrations',
        items: integrationBlocks.map((block) => ({
          label: block.name,
          value: `integration:${block.type}`,
          iconElement: (
            <div
              className='flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center rounded-[3px]'
              style={{ backgroundColor: block.bgColor }}
            >
              <block.icon className='h-[9px] w-[9px] text-white' />
            </div>
          ),
          onSelect: () => handleSelectBlock(block),
        })),
      })
    }

    const selectedWorkflowIds = new Set(
      selectedTools
        .filter((t) => t.type === 'workflow_input')
        .map((t) => t.params?.workflowId as string)
    )
    const availableWorkflows = workflowsList.filter((w) => !selectedWorkflowIds.has(w.id))
    if (availableWorkflows.length > 0) {
      groups.push({
        section: 'Workflows',
        items: availableWorkflows.map((workflow) => ({
          label: workflow.name,
          value: `workflow:${workflow.id}`,
          iconElement: (
            <div className='flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center rounded-[3px] bg-[#6366F1]'>
              <WorkflowIcon className='h-[9px] w-[9px] text-white' />
            </div>
          ),
          onSelect: () => handleSelectWorkflow(workflow),
        })),
      })
    }

    return groups
  }, [
    activeMcpServerId,
    servers,
    mcpTools,
    selectedMcpKeys,
    customTools,
    selectedCustomIds,
    toolBlocks,
    selectedTools,
    workflowsList,
    onChange,
    handleSelectMcpTool,
    handleSelectCustomTool,
    handleSelectBlock,
    handleSelectWorkflow,
  ])

  return (
    <div className='w-full space-y-[8px]'>
      <Combobox
        options={[]}
        groups={toolGroups}
        placeholder='Add tool…'
        searchable
        searchPlaceholder='Search tools…'
        maxHeight={280}
        emptyMessage='No tools available'
        onOpenChange={(open) => {
          if (!open) setActiveMcpServerId(null)
        }}
      />

      {selectedTools.map((tool, idx) => (
        <ToolCard
          key={`${tool.type}-${tool.customToolId ?? ''}-${tool.toolId ?? ''}-${tool.params?.serverId ?? ''}-${tool.params?.toolName ?? ''}-${tool.params?.workflowId ?? ''}-${idx}`}
          tool={tool}
          toolIndex={idx}
          agentId={agentId}
          toolBlocks={toolBlocks}
          showUsageControl={showUsageControl}
          usageControlOpen={usageControlIndex === idx}
          onUsageControlOpenChange={(open) => setUsageControlIndex(open ? idx : null)}
          onRemove={() => handleRemove(idx)}
          onParamChange={(paramId, value) => handleParamChange(idx, paramId, value)}
          onOperationChange={(op) => handleOperationChange(idx, op)}
          onUsageControlChange={(v) => handleUsageControlChange(idx, v)}
          onToggleExpansion={() => toggleExpansion(idx)}
        />
      ))}

      <CustomToolModal
        open={showCustomToolModal}
        onOpenChange={setShowCustomToolModal}
        onSave={(tool: CustomTool) => {
          if (tool.id) {
            handleSelectCustomTool({ id: tool.id, title: tool.title })
          }
        }}
        blockId=''
      />

      <McpServerFormModal
        open={showMcpModal}
        onOpenChange={setShowMcpModal}
        mode='add'
        onSubmit={async (config) => {
          await createMcpServer.mutateAsync({ workspaceId, config: { ...config, enabled: true } })
        }}
        workspaceId={workspaceId}
        availableEnvVars={availableEnvVars}
        allowedMcpDomains={allowedMcpDomains}
      />
    </div>
  )
}

interface ToolCardProps {
  tool: ToolInput
  toolIndex: number
  agentId: string
  toolBlocks: ReturnType<typeof getAllBlocks>
  showUsageControl: boolean
  usageControlOpen: boolean
  onUsageControlOpenChange: (open: boolean) => void
  onRemove: () => void
  onParamChange: (paramId: string, value: string) => void
  onOperationChange: (op: string) => void
  onUsageControlChange: (value: 'auto' | 'force' | 'none') => void
  onToggleExpansion: () => void
}

function ToolCard({
  tool,
  toolIndex,
  agentId,
  toolBlocks,
  showUsageControl,
  usageControlOpen,
  onUsageControlOpenChange,
  onRemove,
  onParamChange,
  onOperationChange,
  onUsageControlChange,
  onToggleExpansion,
}: ToolCardProps) {
  const isCustomTool = tool.type === 'custom-tool'
  const isMcpTool = tool.type === 'mcp'
  const isWorkflowTool = tool.type === 'workflow_input' || tool.type === 'workflow'

  const block = !isCustomTool && !isMcpTool ? toolBlocks.find((b) => b.type === tool.type) : null

  const currentToolId =
    !isCustomTool && !isMcpTool
      ? (getToolIdForOperation(tool.type ?? '', tool.operation) ?? tool.toolId ?? '')
      : (tool.toolId ?? '')

  const subBlocksResult =
    !isCustomTool && !isMcpTool && currentToolId
      ? getSubBlocksForToolInput(currentToolId, tool.type ?? '', {
          operation: tool.operation,
          ...(tool.params || {}),
        })
      : null

  // Exclude input-mapping sub-blocks — the LLM resolves these at runtime
  const displaySubBlocks = (subBlocksResult?.subBlocks ?? []).filter(
    (sb) => sb.type !== 'input-mapping'
  )

  const hasOps = !isCustomTool && !isMcpTool && hasMultipleOperations(tool.type ?? '')
  const hasBody = hasOps || displaySubBlocks.length > 0
  const isExpanded = hasBody ? !!tool.isExpanded : false

  const iconNode = isMcpTool ? (
    <div className='flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center rounded-[4px] bg-[#ede9fb]'>
      <McpIcon className='h-[10px] w-[10px] text-[#6b5fc9]' />
    </div>
  ) : isCustomTool ? (
    <div className='flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center rounded-[4px] bg-[#dbeafe]'>
      <Wrench className='h-[10px] w-[10px] text-[#3b82f6]' />
    </div>
  ) : isWorkflowTool ? (
    <div className='flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center rounded-[4px] bg-[#6366F1]'>
      <WorkflowIcon className='h-[10px] w-[10px] text-white' />
    </div>
  ) : block ? (
    <div
      className='flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center rounded-[4px]'
      style={{ backgroundColor: block.bgColor }}
    >
      <block.icon className='h-[10px] w-[10px] text-white' />
    </div>
  ) : null

  const displayTitle = tool.title ?? tool.params?.toolName ?? tool.type

  const subtitle =
    tool.type === 'mcp' && tool.params?.serverName ? String(tool.params.serverName) : undefined

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[4px] border border-[var(--border-1)] transition-all duration-200 ease-in-out',
        isExpanded ? 'rounded-b-[4px]' : ''
      )}
    >
      {/* Header row */}
      <div
        className={cn(
          'flex items-center justify-between gap-[8px] bg-[var(--surface-4)] px-[8px] py-[6.5px]',
          hasBody ? 'cursor-pointer rounded-t-[4px]' : 'rounded-[4px]'
        )}
        onClick={hasBody ? onToggleExpansion : undefined}
      >
        <div className='flex min-w-0 flex-1 items-center gap-[8px]'>
          {iconNode}
          <div className='min-w-0 flex-1'>
            <span className='block truncate font-medium text-[13px] text-[var(--text-primary)]'>
              {displayTitle}
            </span>
            {subtitle && (
              <span className='block truncate text-[11px] text-[var(--text-muted)]'>
                {subtitle}
              </span>
            )}
          </div>
        </div>
        <div className='flex flex-shrink-0 items-center gap-[6px]'>
          {showUsageControl && (
            <Popover open={usageControlOpen} onOpenChange={onUsageControlOpenChange}>
              <PopoverTrigger asChild>
                <button
                  type='button'
                  onClick={(e) => e.stopPropagation()}
                  className='flex items-center justify-center font-medium text-[12px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]'
                  aria-label='Tool usage control'
                >
                  {tool.usageControl === 'force'
                    ? 'Force'
                    : tool.usageControl === 'none'
                      ? 'None'
                      : 'Auto'}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side='bottom'
                align='end'
                sideOffset={8}
                onClick={(e) => e.stopPropagation()}
                className='gap-[2px]'
                border
              >
                <PopoverItem
                  active={(tool.usageControl || 'auto') === 'auto'}
                  onClick={() => {
                    onUsageControlChange('auto')
                    onUsageControlOpenChange(false)
                  }}
                >
                  Auto <span className='text-[var(--text-tertiary)]'>(model decides)</span>
                </PopoverItem>
                <PopoverItem
                  active={tool.usageControl === 'force'}
                  onClick={() => {
                    onUsageControlChange('force')
                    onUsageControlOpenChange(false)
                  }}
                >
                  Force <span className='text-[var(--text-tertiary)]'>(always use)</span>
                </PopoverItem>
                <PopoverItem
                  active={tool.usageControl === 'none'}
                  onClick={() => {
                    onUsageControlChange('none')
                    onUsageControlOpenChange(false)
                  }}
                >
                  None
                </PopoverItem>
              </PopoverContent>
            </Popover>
          )}
          <button
            type='button'
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className='flex items-center justify-center text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]'
            aria-label='Remove tool'
          >
            <X className='h-[13px] w-[13px]' />
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <ReactFlowProvider>
          <div className='flex flex-col gap-[10px] overflow-visible rounded-b-[4px] border-[var(--border-1)] border-t bg-[var(--surface-2)] px-[8px] py-[8px]'>
            {/* Operation selector */}
            {hasOps &&
              (() => {
                const opOptions = getOperationOptions(tool.type ?? '')
                return opOptions.length > 0 ? (
                  <div className='space-y-[6px]'>
                    <div className='pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'>
                      Operation
                    </div>
                    <Combobox
                      options={opOptions
                        .filter((o) => o.id !== '')
                        .map((o) => ({ label: o.label, value: o.id }))}
                      value={tool.operation || opOptions[0]?.id || ''}
                      onChange={(v) => onOperationChange(v)}
                      placeholder='Select operation'
                    />
                  </div>
                ) : null
              })()}

            {/* Sub-block params */}
            {displaySubBlocks.map((sb) => (
              <ToolSubBlockRenderer
                key={sb.id}
                blockId={agentId}
                subBlockId='agent-tools'
                toolIndex={toolIndex}
                subBlock={{ ...sb, title: sb.title || sb.id }}
                effectiveParamId={sb.id}
                toolParams={tool.params as Record<string, string> | undefined}
                onParamChange={(_, paramId, value) => onParamChange(paramId, value)}
                disabled={false}
              />
            ))}
          </div>
        </ReactFlowProvider>
      )}
    </div>
  )
}

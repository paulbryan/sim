'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Button,
  Combobox,
  type ComboboxOption,
  type ComboboxOptionGroup,
  Input,
  Label,
  Textarea,
} from '@/components/emcn'
import { ArrowUp, ChevronDown, Plus, X } from '@/components/emcn/icons'
import { AgentSkillsIcon } from '@/components/icons'
import type { AgentConfig, SkillInput } from '@/lib/agents/types'
import { getScopesForService } from '@/lib/oauth/utils'
import { AgentToolInput } from '@/app/workspace/[workspaceId]/agents/[agentId]/components/agent-config/agent-tool-input'
import {
  type AgentWandState,
  useAgentWand,
} from '@/app/workspace/[workspaceId]/agents/[agentId]/hooks/use-agent-wand'
import { SkillModal } from '@/app/workspace/[workspaceId]/settings/components/skills/components/skill-modal'
import {
  checkEnvVarTrigger,
  EnvVarDropdown,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/env-var-dropdown'
import { formatDisplayText } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/formatted-text'
import { ToolCredentialSelector } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/tool-input/components/tools/credential-selector'
import {
  getModelOptions,
  RESPONSE_FORMAT_WAND_CONFIG,
  shouldRequireApiKeyForModel,
} from '@/blocks/utils'
import { type SkillDefinition, useSkills } from '@/hooks/queries/skills'
import {
  getMaxTemperature,
  getReasoningEffortValuesForModel,
  getThinkingLevelsForModel,
  getVerbosityValuesForModel,
  MODELS_WITH_DEEP_RESEARCH,
  MODELS_WITH_REASONING_EFFORT,
  MODELS_WITH_THINKING,
  MODELS_WITH_VERBOSITY,
  MODELS_WITHOUT_MEMORY,
  providers,
  supportsTemperature,
} from '@/providers/utils'
import { useProvidersStore } from '@/stores/providers/store'

const MEMORY_OPTIONS: ComboboxOption[] = [
  { value: 'none', label: 'None' },
  { value: 'conversation', label: 'Conversation history' },
  { value: 'sliding_window', label: 'Sliding window (messages)' },
  { value: 'sliding_window_tokens', label: 'Sliding window (tokens)' },
]

const AZURE_MODELS = [...providers['azure-openai'].models, ...providers['azure-anthropic'].models]

const DASHED_DIVIDER_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(to right, var(--border) 0px, var(--border) 6px, transparent 6px, transparent 12px)',
} as const

interface AgentConfigPanelProps {
  config: AgentConfig
  agentId: string
  workspaceId: string
  onConfigChange: (patch: Partial<AgentConfig>) => void
}

const SYSTEM_PROMPT_WAND_PROMPT = `You are an expert at creating professional, comprehensive LLM agent system prompts. Generate or modify a system prompt based on the user's request.

Current system prompt: {context}

RULES:
1. Generate ONLY the system prompt text — no JSON, no explanations, no markdown fences
2. Start with a clear role definition ("You are...")
3. Include specific methodology, response format requirements, and edge case handling
4. If editing, preserve structure unless asked to change it
5. Be detailed and professional`

function Divider() {
  return (
    <div className='px-[2px] pt-[16px] pb-[13px]'>
      <div className='h-[1.25px]' style={DASHED_DIVIDER_STYLE} />
    </div>
  )
}

function FieldLabelRow({ label }: { label: string }) {
  return (
    <div className='flex items-center justify-between gap-[6px] pl-[2px]'>
      <Label className='font-medium text-[13px]'>{label}</Label>
    </div>
  )
}

export function AgentConfigPanel({
  config,
  agentId,
  workspaceId,
  onConfigChange,
}: AgentConfigPanelProps) {
  const storeProviders = useProvidersStore((s) => s.providers)
  const model = config.model ?? ''
  const [showAdvanced, setShowAdvanced] = useState(false)

  const derived = useMemo(() => {
    const reasoningValues = model ? getReasoningEffortValuesForModel(model) : null
    const thinkingValues = model ? getThinkingLevelsForModel(model) : null
    const verbosityValues = model ? getVerbosityValuesForModel(model) : null

    const toOptions = (vals: string[]): ComboboxOption[] =>
      vals.map((v) => ({ value: v, label: v }))

    const isDeepResearch = MODELS_WITH_DEEP_RESEARCH.includes(model)
    const showTemperature = Boolean(model) && supportsTemperature(model) && !isDeepResearch

    return {
      isVertexModel: providers.vertex.models.includes(model),
      isAzureModel: AZURE_MODELS.includes(model),
      isBedrockModel: providers.bedrock.models.includes(model),
      showApiKey: shouldRequireApiKeyForModel(model),
      isDeepResearch,
      showMemory: !MODELS_WITHOUT_MEMORY.includes(model),
      showReasoningEffort: MODELS_WITH_REASONING_EFFORT.includes(model),
      showThinking: MODELS_WITH_THINKING.includes(model),
      showVerbosity: MODELS_WITH_VERBOSITY.includes(model),
      showTemperature,
      maxTemperature: (model && getMaxTemperature(model)) ?? 1,
      reasoningEffortOptions: toOptions(reasoningValues ?? ['auto', 'low', 'medium', 'high']),
      thinkingLevelOptions: toOptions(
        thinkingValues ? ['none', ...thinkingValues] : ['none', 'low', 'high']
      ),
      verbosityOptions: toOptions(verbosityValues ?? ['auto', 'low', 'medium', 'high']),
    }
  }, [model])

  const hasAdvancedFields =
    derived.showReasoningEffort ||
    derived.showThinking ||
    derived.showVerbosity ||
    derived.showTemperature ||
    !derived.isDeepResearch

  const modelOptions: ComboboxOption[] = useMemo(
    () =>
      getModelOptions().map((opt) => ({
        label: opt.label,
        value: opt.id,
        ...(opt.icon && { icon: opt.icon }),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeProviders]
  )

  const systemPrompt = config.messages?.find((m) => m.role === 'system')?.content ?? ''

  const handleSystemPromptChange = useCallback(
    (value: string) => {
      const filtered = (config.messages ?? []).filter((m) => m.role !== 'system')
      const messages = value.trim()
        ? [{ role: 'system' as const, content: value }, ...filtered]
        : filtered
      onConfigChange({ messages })
    },
    [config.messages, onConfigChange]
  )

  const systemPromptWand = useAgentWand({
    systemPrompt: SYSTEM_PROMPT_WAND_PROMPT,
    maintainHistory: true,
    currentValue: systemPrompt,
    onGeneratedContent: handleSystemPromptChange,
  })

  const responseFormatWand = useAgentWand({
    systemPrompt: RESPONSE_FORMAT_WAND_CONFIG.prompt,
    generationType: RESPONSE_FORMAT_WAND_CONFIG.generationType,
    maintainHistory: RESPONSE_FORMAT_WAND_CONFIG.maintainHistory,
    currentValue: config.responseFormat ?? '',
    onGeneratedContent: (content) => onConfigChange({ responseFormat: content }),
  })

  const [apiKeyFocused, setApiKeyFocused] = useState(false)
  const [apiKeyEnvDropdown, setApiKeyEnvDropdown] = useState({ visible: false, searchTerm: '' })
  const apiKeyInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className='px-[8px] pt-[12px] pb-[8px]'>
      {/* System prompt */}
      <div className='flex flex-col gap-[10px]'>
        <WandLabelRow label='System prompt' wand={systemPromptWand} />
        <Textarea
          placeholder='You are a helpful assistant…'
          value={systemPrompt}
          onChange={(e) => handleSystemPromptChange(e.target.value)}
          rows={6}
          className='resize-none text-[13px]'
        />
      </div>
      <Divider />

      {/* Model */}
      <div className='flex flex-col gap-[10px]'>
        <FieldLabelRow label='Model' />
        <Combobox
          options={modelOptions}
          value={config.model ?? ''}
          onChange={(v) => onConfigChange({ model: v })}
          placeholder='claude-sonnet-4-6'
          editable
          searchable
          searchPlaceholder='Search models…'
          emptyMessage='No models found'
          maxHeight={240}
          inputProps={{ autoComplete: 'off' }}
        />
      </div>
      <Divider />

      {/* Vertex AI */}
      {derived.isVertexModel && (
        <>
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='Google Cloud account' />
            <ToolCredentialSelector
              value={config.vertexCredential ?? ''}
              onChange={(v) => onConfigChange({ vertexCredential: v || undefined })}
              provider='vertex-ai'
              serviceId='vertex-ai'
              requiredScopes={getScopesForService('vertex-ai')}
            />
          </div>
          <Divider />
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='Google Cloud project' />
            <Input
              value={config.vertexProject ?? ''}
              placeholder='your-gcp-project-id'
              autoComplete='off'
              onChange={(e) => onConfigChange({ vertexProject: e.target.value || undefined })}
            />
          </div>
          <Divider />
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='Google Cloud location' />
            <Input
              value={config.vertexLocation ?? ''}
              placeholder='us-central1'
              autoComplete='off'
              onChange={(e) => onConfigChange({ vertexLocation: e.target.value || undefined })}
            />
          </div>
          <Divider />
        </>
      )}

      {/* Azure */}
      {derived.isAzureModel && (
        <>
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='Azure endpoint' />
            <Input
              value={config.azureEndpoint ?? ''}
              placeholder='https://your-resource.services.ai.azure.com'
              autoComplete='off'
              onChange={(e) => onConfigChange({ azureEndpoint: e.target.value || undefined })}
            />
          </div>
          <Divider />
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='Azure API version' />
            <Input
              value={config.azureApiVersion ?? ''}
              placeholder='2024-12-01-preview'
              autoComplete='off'
              onChange={(e) => onConfigChange({ azureApiVersion: e.target.value || undefined })}
            />
          </div>
          <Divider />
        </>
      )}

      {/* AWS Bedrock */}
      {derived.isBedrockModel && (
        <>
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='AWS access key ID' />
            <Input
              value={config.bedrockAccessKeyId ?? ''}
              placeholder='Enter your AWS Access Key ID'
              autoComplete='off'
              onChange={(e) => onConfigChange({ bedrockAccessKeyId: e.target.value || undefined })}
            />
          </div>
          <Divider />
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='AWS secret access key' />
            <Input
              value={config.bedrockSecretKey ?? ''}
              placeholder='Enter your AWS Secret Access Key'
              autoComplete='off'
              onChange={(e) => onConfigChange({ bedrockSecretKey: e.target.value || undefined })}
            />
          </div>
          <Divider />
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='AWS region' />
            <Input
              value={config.bedrockRegion ?? ''}
              placeholder='us-east-1'
              autoComplete='off'
              onChange={(e) => onConfigChange({ bedrockRegion: e.target.value || undefined })}
            />
          </div>
          <Divider />
        </>
      )}

      {/* API key */}
      {derived.showApiKey && (
        <>
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='API key' />
            <div className='relative'>
              <Input
                ref={apiKeyInputRef}
                type='text'
                value={
                  apiKeyFocused ? (config.apiKey ?? '') : '•'.repeat(config.apiKey?.length ?? 0)
                }
                placeholder='Enter your API key'
                autoComplete='off'
                data-lpignore='true'
                data-form-type='other'
                className='allow-scroll w-full overflow-auto text-transparent caret-foreground [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground/50 [&::-webkit-scrollbar]:hidden'
                onFocus={() => setApiKeyFocused(true)}
                onBlur={() => setApiKeyFocused(false)}
                onChange={(e) => {
                  const val = e.target.value
                  onConfigChange({ apiKey: val || undefined })
                  const cursor = e.target.selectionStart ?? val.length
                  const { show, searchTerm } = checkEnvVarTrigger(val, cursor)
                  setApiKeyEnvDropdown({ visible: show, searchTerm })
                }}
              />
              <div className='pointer-events-none absolute inset-0 flex items-center overflow-x-auto px-[8px] py-[6px] pr-3 font-medium font-sans text-foreground text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
                <div className='min-w-fit whitespace-pre'>
                  {apiKeyFocused
                    ? formatDisplayText(config.apiKey ?? '')
                    : '•'.repeat(config.apiKey?.length ?? 0)}
                </div>
              </div>
              <EnvVarDropdown
                visible={apiKeyEnvDropdown.visible}
                searchTerm={apiKeyEnvDropdown.searchTerm}
                inputValue={config.apiKey ?? ''}
                cursorPosition={
                  apiKeyInputRef.current?.selectionStart ?? config.apiKey?.length ?? 0
                }
                workspaceId={workspaceId}
                inputRef={apiKeyInputRef as React.RefObject<HTMLInputElement>}
                onSelect={(newValue) => {
                  onConfigChange({ apiKey: newValue || undefined })
                  setApiKeyEnvDropdown({ visible: false, searchTerm: '' })
                }}
                onClose={() => setApiKeyEnvDropdown({ visible: false, searchTerm: '' })}
              />
            </div>
          </div>
          <Divider />
        </>
      )}

      {/* Tools */}
      {!derived.isDeepResearch && (
        <>
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='Tools' />
            <AgentToolInput
              workspaceId={workspaceId}
              selectedTools={config.tools ?? []}
              model={config.model}
              onChange={(tools) => onConfigChange({ tools })}
            />
          </div>
          <Divider />
        </>
      )}

      {/* Skills */}
      {!derived.isDeepResearch && (
        <>
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='Skills' />
            <SkillsInput
              workspaceId={workspaceId}
              selectedSkills={config.skills ?? []}
              onChange={(skills) => onConfigChange({ skills })}
            />
          </div>
          <Divider />
        </>
      )}

      {/* Memory */}
      {derived.showMemory && (
        <>
          <div className='flex flex-col gap-[10px]'>
            <FieldLabelRow label='Memory' />
            <Combobox
              options={MEMORY_OPTIONS}
              value={config.memoryType ?? 'none'}
              onChange={(v) => onConfigChange({ memoryType: v as AgentConfig['memoryType'] })}
            />
          </div>

          {config.memoryType && config.memoryType !== 'none' && (
            <>
              <Divider />
              <div className='flex flex-col gap-[10px]'>
                <FieldLabelRow label='Conversation ID' />
                <Input
                  value={config.conversationId ?? ''}
                  placeholder='e.g., user-123, session-abc'
                  autoComplete='off'
                  onChange={(e) => onConfigChange({ conversationId: e.target.value || undefined })}
                />
              </div>
            </>
          )}

          {config.memoryType === 'sliding_window' && (
            <>
              <Divider />
              <div className='flex flex-col gap-[10px]'>
                <FieldLabelRow label='Window size (messages)' />
                <Input
                  value={config.slidingWindowSize ?? ''}
                  placeholder='20'
                  autoComplete='off'
                  onChange={(e) =>
                    onConfigChange({ slidingWindowSize: e.target.value || undefined })
                  }
                />
              </div>
            </>
          )}

          {config.memoryType === 'sliding_window_tokens' && (
            <>
              <Divider />
              <div className='flex flex-col gap-[10px]'>
                <FieldLabelRow label='Window size (tokens)' />
                <Input
                  value={config.slidingWindowTokens ?? ''}
                  placeholder='4000'
                  autoComplete='off'
                  onChange={(e) =>
                    onConfigChange({ slidingWindowTokens: e.target.value || undefined })
                  }
                />
              </div>
            </>
          )}
          <Divider />
        </>
      )}

      {/* Response format */}
      {!derived.isDeepResearch && (
        <div className='flex flex-col gap-[10px]'>
          <WandLabelRow label='Response format' wand={responseFormatWand} />
          <Textarea
            placeholder={
              '{\n  "name": "my_schema",\n  "strict": true,\n  "schema": { "type": "object", "properties": {} }\n}'
            }
            value={config.responseFormat ?? ''}
            onChange={(e) => onConfigChange({ responseFormat: e.target.value || undefined })}
            rows={4}
            className='resize-none font-mono text-[12px]'
          />
        </div>
      )}

      {/* Previous interaction ID (deep research) */}
      {derived.isDeepResearch && (
        <div className='flex flex-col gap-[10px]'>
          <FieldLabelRow label='Previous interaction ID' />
          <Input
            value={config.previousInteractionId ?? ''}
            placeholder='e.g., {{agent_1.interactionId}}'
            autoComplete='off'
            onChange={(e) => onConfigChange({ previousInteractionId: e.target.value || undefined })}
          />
        </div>
      )}

      {/* Advanced fields toggle */}
      {hasAdvancedFields && (
        <>
          <div className='flex items-center gap-[10px] px-[2px] pt-[14px] pb-[12px]'>
            <div className='h-[1.25px] flex-1' style={DASHED_DIVIDER_STYLE} />
            <button
              type='button'
              onClick={() => setShowAdvanced((v) => !v)}
              className='flex items-center gap-[6px] whitespace-nowrap font-medium text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            >
              {showAdvanced ? 'Hide additional fields' : 'Show additional fields'}
              <ChevronDown
                className={`h-[14px] w-[14px] transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
              />
            </button>
            <div className='h-[1.25px] flex-1' style={DASHED_DIVIDER_STYLE} />
          </div>

          {showAdvanced && (
            <>
              {derived.showReasoningEffort && (
                <>
                  <div className='flex flex-col gap-[10px]'>
                    <FieldLabelRow label='Reasoning effort' />
                    <Combobox
                      options={derived.reasoningEffortOptions}
                      value={config.reasoningEffort ?? 'auto'}
                      onChange={(v) => onConfigChange({ reasoningEffort: v })}
                    />
                  </div>
                  <Divider />
                </>
              )}

              {derived.showThinking && (
                <>
                  <div className='flex flex-col gap-[10px]'>
                    <FieldLabelRow label='Thinking level' />
                    <Combobox
                      options={derived.thinkingLevelOptions}
                      value={config.thinkingLevel ?? 'none'}
                      onChange={(v) => onConfigChange({ thinkingLevel: v })}
                    />
                  </div>
                  <Divider />
                </>
              )}

              {derived.showVerbosity && (
                <>
                  <div className='flex flex-col gap-[10px]'>
                    <FieldLabelRow label='Verbosity' />
                    <Combobox
                      options={derived.verbosityOptions}
                      value={config.verbosity ?? 'auto'}
                      onChange={(v) => onConfigChange({ verbosity: v })}
                    />
                  </div>
                  <Divider />
                </>
              )}

              {derived.showTemperature && (
                <>
                  <div className='flex flex-col gap-[10px]'>
                    <FieldLabelRow label={`Temperature (0–${derived.maxTemperature})`} />
                    <Input
                      type='number'
                      value={config.temperature ?? ''}
                      min={0}
                      max={derived.maxTemperature}
                      step={0.1}
                      placeholder='1.0'
                      onChange={(e) => {
                        const v = Number.parseFloat(e.target.value)
                        onConfigChange({ temperature: Number.isNaN(v) ? undefined : v })
                      }}
                    />
                  </div>
                  <Divider />
                </>
              )}

              {!derived.isDeepResearch && (
                <div className='flex flex-col gap-[10px]'>
                  <FieldLabelRow label='Max tokens' />
                  <Input
                    type='number'
                    value={config.maxTokens ?? ''}
                    min={1}
                    max={200000}
                    placeholder='default'
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value)
                      onConfigChange({ maxTokens: Number.isNaN(v) ? undefined : v })
                    }}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

interface WandLabelRowProps {
  label: string
  wand: AgentWandState
}

function WandLabelRow({ label, wand }: WandLabelRowProps) {
  return (
    <div className='flex items-center justify-between gap-[6px] pl-[2px]'>
      <Label className='font-medium text-[13px]'>{label}</Label>
      <div className='flex min-w-0 flex-1 items-center justify-end'>
        {!wand.isSearchActive ? (
          <Button
            variant='active'
            className='-my-1 h-5 px-2 py-0 text-[11px]'
            onClick={wand.onSearchClick}
          >
            Generate
          </Button>
        ) : (
          <div className='-my-1 flex min-w-[120px] max-w-[280px] flex-1 items-center gap-[4px]'>
            <Input
              ref={wand.searchInputRef}
              value={wand.isStreaming ? 'Generating...' : wand.searchQuery}
              onChange={(e) => wand.onSearchChange(e.target.value)}
              onBlur={(e) => {
                const relatedTarget = e.relatedTarget as HTMLElement | null
                if (relatedTarget?.closest('button')) return
                wand.onSearchBlur()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && wand.searchQuery.trim() && !wand.isStreaming) {
                  wand.onSearchSubmit()
                } else if (e.key === 'Escape') {
                  wand.onSearchCancel()
                }
              }}
              disabled={wand.isStreaming}
              className='h-5 min-w-[80px] flex-1 text-[11px]'
              placeholder='Generate with AI...'
            />
            <Button
              variant='primary'
              disabled={!wand.searchQuery.trim() || wand.isStreaming}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                wand.onSearchSubmit()
              }}
              className='h-[20px] w-[20px] flex-shrink-0 p-0'
            >
              <ArrowUp className='h-[12px] w-[12px]' />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

interface SkillsInputProps {
  workspaceId: string
  selectedSkills: SkillInput[]
  onChange: (skills: SkillInput[]) => void
}

function SkillsInput({ workspaceId, selectedSkills, onChange }: SkillsInputProps) {
  const { data: workspaceSkills = [] } = useSkills(workspaceId)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillDefinition | null>(null)

  const selectedIds = useMemo(() => new Set(selectedSkills.map((s) => s.skillId)), [selectedSkills])

  const skillGroups = useMemo((): ComboboxOptionGroup[] => {
    const available = workspaceSkills.filter((s) => !selectedIds.has(s.id))
    const groups: ComboboxOptionGroup[] = [
      {
        items: [
          {
            label: 'Create skill',
            value: 'action-create-skill',
            icon: Plus,
            onSelect: () => setShowCreateModal(true),
            keepOpen: false,
          },
        ],
      },
    ]
    if (available.length > 0) {
      groups.push({
        section: 'Skills',
        items: available.map((s) => ({
          label: s.name,
          value: `skill-${s.id}`,
          icon: AgentSkillsIcon,
          onSelect: () => onChange([...selectedSkills, { skillId: s.id, name: s.name }]),
        })),
      })
    }
    return groups
  }, [workspaceSkills, selectedIds, selectedSkills, onChange])

  const handleRemove = useCallback(
    (skillId: string) => onChange(selectedSkills.filter((s) => s.skillId !== skillId)),
    [selectedSkills, onChange]
  )

  const resolveSkillName = useCallback(
    (stored: SkillInput): string => {
      const found = workspaceSkills.find((s) => s.id === stored.skillId)
      return found?.name ?? stored.name ?? stored.skillId
    },
    [workspaceSkills]
  )

  return (
    <>
      <div className='w-full space-y-[8px]'>
        <Combobox
          options={[]}
          groups={skillGroups}
          placeholder='Add skill…'
          searchable
          searchPlaceholder='Search skills…'
          maxHeight={240}
          emptyMessage='No skills found'
        />

        {selectedSkills.map((stored) => {
          const fullSkill = workspaceSkills.find((s) => s.id === stored.skillId)
          return (
            <div
              key={stored.skillId}
              className='group relative flex flex-col overflow-hidden rounded-[4px] border border-[var(--border-1)] transition-all duration-200 ease-in-out'
            >
              <div
                className='flex cursor-pointer items-center justify-between gap-[8px] rounded-[4px] bg-[var(--surface-4)] px-[8px] py-[6.5px]'
                onClick={() => fullSkill && setEditingSkill(fullSkill)}
              >
                <div className='flex min-w-0 flex-1 items-center gap-[8px]'>
                  <div className='flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center rounded-[4px] bg-[var(--surface-4)]'>
                    <AgentSkillsIcon className='h-[10px] w-[10px] text-[#333]' />
                  </div>
                  <span className='truncate font-medium text-[13px] text-[var(--text-primary)]'>
                    {resolveSkillName(stored)}
                  </span>
                </div>
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemove(stored.skillId)
                  }}
                  className='flex items-center justify-center text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]'
                  aria-label='Remove skill'
                >
                  <X className='h-[13px] w-[13px]' />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <SkillModal
        open={showCreateModal || !!editingSkill}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateModal(false)
            setEditingSkill(null)
          }
        }}
        onSave={() => {
          setShowCreateModal(false)
          setEditingSkill(null)
        }}
        initialValues={editingSkill ?? undefined}
      />
    </>
  )
}

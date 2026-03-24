'use client'

import { useCallback, useMemo, useState } from 'react'
import { createLogger } from '@sim/logger'
import { Button, Combobox, type ComboboxOption, Input, Label } from '@/components/emcn'
import { Check, Loader, Plus } from '@/components/emcn/icons'
import type { AgentDeploymentRow, SlackDeploymentConfig } from '@/lib/agents/types'
import { cn } from '@/lib/core/utils/cn'
import { getCanonicalScopesForProvider } from '@/lib/oauth'
import { OAuthRequiredModal } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/credential-selector/components/oauth-required-modal'
import {
  useAgent,
  useDeployAgentToSlack,
  useSlackChannels,
  useUndeployAgentFromSlack,
} from '@/hooks/queries/agents'
import { useWorkspaceCredentials, type WorkspaceCredential } from '@/hooks/queries/credentials'

const logger = createLogger('SlackDeploy')

interface SlackDeployProps {
  agentId: string
  workspaceId: string
}

const RESPOND_TO_OPTIONS: ComboboxOption[] = [
  { value: 'mentions', label: '@mentions only' },
  { value: 'all', label: 'All messages in channel' },
  { value: 'threads', label: 'Thread replies only' },
  { value: 'dm', label: 'Direct messages (DMs)' },
]

export function SlackDeploy({ agentId, workspaceId }: SlackDeployProps) {
  const { data: agent } = useAgent(agentId)
  const { data: credentials = [], isLoading: isLoadingCredentials } = useWorkspaceCredentials({
    workspaceId,
    type: 'oauth',
    providerId: 'slack',
  })

  const existingDeployment = agent?.deployments?.find((d) => d.platform === 'slack')

  return (
    <SlackDeployForm
      key={existingDeployment?.id ?? 'new'}
      agentId={agentId}
      existingDeployment={existingDeployment}
      credentials={credentials}
      isLoadingCredentials={isLoadingCredentials}
    />
  )
}

interface SlackDeployFormProps {
  agentId: string
  existingDeployment: AgentDeploymentRow | undefined
  credentials: WorkspaceCredential[]
  isLoadingCredentials: boolean
}

function SlackDeployForm({
  agentId,
  existingDeployment,
  credentials,
  isLoadingCredentials,
}: SlackDeployFormProps) {
  const [showOAuthModal, setShowOAuthModal] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const { mutateAsync: deploy, isPending: isDeploying } = useDeployAgentToSlack()
  const { mutateAsync: undeploy, isPending: isUndeploying } = useUndeployAgentFromSlack()

  const existingCfg = existingDeployment?.config as SlackDeploymentConfig | undefined

  const [selectedCredentialId, setSelectedCredentialId] = useState(
    existingDeployment?.credentialId ?? ''
  )
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>(
    existingCfg?.channelIds ?? []
  )
  const [respondTo, setRespondTo] = useState<SlackDeploymentConfig['respondTo']>(
    existingCfg?.respondTo ?? 'mentions'
  )
  const [botName, setBotName] = useState(existingCfg?.botName ?? '')
  const [replyInThread, setReplyInThread] = useState(existingCfg?.replyInThread !== false)

  const isDeployed = Boolean(existingDeployment?.isActive)
  const isDmMode = respondTo === 'dm'

  const { data: channels = [], isLoading: isLoadingChannels } =
    useSlackChannels(selectedCredentialId)

  const handleCredentialChange = useCallback((id: string) => {
    setSelectedCredentialId(id)
    setSelectedChannelIds([])
  }, [])

  const handleDeploy = useCallback(async () => {
    if (!selectedCredentialId) return
    if (!isDmMode && selectedChannelIds.length === 0) return
    setDeployError(null)
    try {
      await deploy({
        agentId,
        credentialId: selectedCredentialId,
        channelIds: isDmMode ? [] : selectedChannelIds,
        respondTo,
        botName: botName.trim() || undefined,
        replyInThread,
      })
    } catch (error) {
      logger.error('Failed to deploy agent to Slack', { error })
      setDeployError(error instanceof Error ? error.message : 'Deployment failed')
    }
  }, [
    agentId,
    botName,
    deploy,
    isDmMode,
    respondTo,
    replyInThread,
    selectedChannelIds,
    selectedCredentialId,
  ])

  const handleUndeploy = useCallback(async () => {
    try {
      await undeploy({ agentId })
    } catch (error) {
      logger.error('Failed to undeploy agent from Slack', { error })
    }
  }, [agentId, undeploy])

  const toggleChannel = useCallback((channelId: string) => {
    setSelectedChannelIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]
    )
  }, [])

  const credentialOptions: ComboboxOption[] = useMemo(
    () => credentials.map((c) => ({ value: c.id, label: c.displayName })),
    [credentials]
  )

  const hasValidConfig = selectedCredentialId && (isDmMode || selectedChannelIds.length > 0)

  return (
    <>
      <OAuthRequiredModal
        isOpen={showOAuthModal}
        onClose={() => setShowOAuthModal(false)}
        provider='slack'
        toolName='Slack'
        requiredScopes={getCanonicalScopesForProvider('slack')}
        serviceId='slack'
      />
      <div className='flex flex-col gap-[16px]'>
        {/* Workspace */}
        <div>
          <Label className='mb-[6px] block text-[12px] text-[var(--text-muted)]'>
            Slack workspace
          </Label>
          {isLoadingCredentials ? (
            <div className='flex h-[36px] items-center gap-[6px] text-[12px] text-[var(--text-muted)]'>
              <Loader className='h-[12px] w-[12px] animate-spin' />
              Loading…
            </div>
          ) : credentials.length === 0 ? (
            <div className='flex flex-col gap-[8px]'>
              <p className='text-[12px] text-[var(--text-muted)]'>
                No Slack workspace connected yet.
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setShowOAuthModal(true)}
                className='w-fit'
              >
                <Plus className='mr-[4px] h-[12px] w-[12px]' />
                Connect Slack
              </Button>
            </div>
          ) : (
            <div className='flex items-center gap-[8px]'>
              <div className='flex-1'>
                <Combobox
                  options={credentialOptions}
                  value={selectedCredentialId}
                  onChange={handleCredentialChange}
                  placeholder='Select a Slack workspace…'
                />
              </div>
              <button
                type='button'
                onClick={() => setShowOAuthModal(true)}
                className='flex-shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]'
                title='Connect another workspace'
              >
                <Plus className='h-[14px] w-[14px]' />
              </button>
            </div>
          )}
        </div>

        {selectedCredentialId && (
          <>
            {/* Respond to */}
            <div>
              <Label className='mb-[6px] block text-[12px] text-[var(--text-muted)]'>
                Respond to
              </Label>
              <Combobox
                options={RESPOND_TO_OPTIONS}
                value={respondTo}
                onChange={(v) => setRespondTo(v as SlackDeploymentConfig['respondTo'])}
              />
            </div>

            {/* Channels — hidden in DM mode */}
            {!isDmMode && (
              <div>
                <Label className='mb-[6px] block text-[12px] text-[var(--text-muted)]'>
                  Channels <span className='font-normal opacity-60'>(select one or more)</span>
                </Label>
                {isLoadingChannels ? (
                  <div className='flex h-[32px] items-center gap-[6px] text-[12px] text-[var(--text-muted)]'>
                    <Loader className='h-[12px] w-[12px] animate-spin' />
                    Loading channels…
                  </div>
                ) : channels.length === 0 ? (
                  <p className='text-[12px] text-[var(--text-muted)]'>
                    No accessible channels found. Make sure the bot has been added to at least one
                    channel.
                  </p>
                ) : (
                  <div className='max-h-[160px] overflow-y-auto rounded-[4px] border border-[var(--border-1)]'>
                    {channels.map((channel) => (
                      <button
                        key={channel.id}
                        type='button'
                        onClick={() => toggleChannel(channel.id)}
                        className={cn(
                          'flex w-full items-center gap-[8px] px-[10px] py-[7px] text-left text-[12px] transition-colors',
                          'hover:bg-[var(--surface-7)]',
                          selectedChannelIds.includes(channel.id) && 'bg-[var(--surface-4)]'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center rounded-[3px] border',
                            selectedChannelIds.includes(channel.id)
                              ? 'border-[var(--text-primary)] bg-[var(--text-primary)]'
                              : 'border-[var(--border-1)]'
                          )}
                        >
                          {selectedChannelIds.includes(channel.id) && (
                            <Check className='h-[9px] w-[9px] text-[var(--surface-1)]' />
                          )}
                        </span>
                        <span className='text-[var(--text-primary)]'>
                          {channel.isPrivate ? '🔒 ' : '#'}
                          {channel.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bot display name */}
            <div>
              <Label className='mb-[6px] block text-[12px] text-[var(--text-muted)]'>
                Bot display name <span className='font-normal opacity-60'>(optional)</span>
              </Label>
              <Input
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder='e.g. Sales Assistant'
                maxLength={80}
                className='h-[34px] text-[12px]'
              />
            </div>

            {/* Reply in thread */}
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-[12px] text-[var(--text-primary)]'>Reply in thread</p>
                <p className='text-[11px] text-[var(--text-muted)]'>
                  Keep responses inside the original thread
                </p>
              </div>
              <button
                type='button'
                onClick={() => setReplyInThread((v) => !v)}
                className={cn(
                  'relative h-[20px] w-[36px] flex-shrink-0 rounded-full transition-colors',
                  replyInThread ? 'bg-[var(--text-primary)]' : 'bg-[var(--border-1)]'
                )}
                aria-checked={replyInThread}
                role='switch'
              >
                <span
                  className={cn(
                    'absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform',
                    replyInThread ? 'translate-x-[18px]' : 'translate-x-[2px]'
                  )}
                />
              </button>
            </div>
          </>
        )}

        {/* Error */}
        {deployError && (
          <p className='rounded-[4px] bg-[var(--error-bg,#fef2f2)] px-[10px] py-[6px] text-[12px] text-[var(--error,#dc2626)]'>
            {deployError}
          </p>
        )}

        {/* Actions */}
        <div className='flex items-center gap-[8px] pt-[4px]'>
          {isDeployed ? (
            <>
              <div className='flex items-center gap-[6px] text-[12px] text-[var(--text-success,#16a34a)]'>
                <span className='h-[6px] w-[6px] rounded-full bg-[var(--text-success,#16a34a)]' />
                Deployed
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={handleDeploy}
                disabled={!hasValidConfig || isDeploying}
                className='ml-auto'
              >
                {isDeploying ? (
                  <Loader className='mr-[4px] h-[12px] w-[12px] animate-spin' />
                ) : null}
                Update
              </Button>
              <Button variant='outline' size='sm' onClick={handleUndeploy} disabled={isUndeploying}>
                {isUndeploying ? (
                  <Loader className='mr-[4px] h-[12px] w-[12px] animate-spin' />
                ) : null}
                Remove
              </Button>
            </>
          ) : (
            <Button
              size='sm'
              onClick={handleDeploy}
              disabled={!hasValidConfig || isDeploying}
              className='ml-auto'
            >
              {isDeploying ? <Loader className='mr-[4px] h-[12px] w-[12px] animate-spin' /> : null}
              Deploy to Slack
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

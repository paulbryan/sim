import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AgentConfig,
  AgentDeploymentRow,
  AgentRow,
  SlackDeploymentConfig,
} from '@/lib/agents/types'

export type AgentQueryScope = 'active' | 'archived' | 'all'

export interface Agent extends AgentRow {
  deployments?: AgentDeploymentRow[]
}

export interface CreateAgentParams {
  workspaceId: string
  name: string
  description?: string
  config?: Partial<AgentConfig>
}

export interface UpdateAgentParams {
  agentId: string
  name?: string
  description?: string
  config?: Partial<AgentConfig>
  isDeployed?: boolean
}

export interface DeployAgentToSlackParams {
  agentId: string
  credentialId: string
  channelIds: string[]
  respondTo: SlackDeploymentConfig['respondTo']
  botName?: string
  replyInThread?: boolean
}

export const agentKeys = {
  all: ['agents'] as const,
  lists: () => [...agentKeys.all, 'list'] as const,
  list: (workspaceId: string, scope: AgentQueryScope = 'active') =>
    [...agentKeys.lists(), workspaceId, scope] as const,
  details: () => [...agentKeys.all, 'detail'] as const,
  detail: (agentId: string) => [...agentKeys.details(), agentId] as const,
  slackChannels: (credentialId: string) =>
    [...agentKeys.all, 'slack-channels', credentialId] as const,
}

async function fetchAgents(
  workspaceId: string,
  scope: AgentQueryScope,
  signal?: AbortSignal
): Promise<Agent[]> {
  const res = await fetch(
    `/api/agents?workspaceId=${encodeURIComponent(workspaceId)}&scope=${scope}`,
    { signal }
  )
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to fetch agents')
  }
  const json = await res.json()
  return json.data
}

async function fetchAgent(agentId: string, signal?: AbortSignal): Promise<Agent> {
  const res = await fetch(`/api/agents/${agentId}`, { signal })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to fetch agent')
  }
  const json = await res.json()
  return json.data
}

/**
 * List all agents for a workspace.
 */
export function useAgentsList(workspaceId: string, scope: AgentQueryScope = 'active') {
  return useQuery({
    queryKey: agentKeys.list(workspaceId, scope),
    queryFn: ({ signal }) => fetchAgents(workspaceId, scope, signal),
    enabled: Boolean(workspaceId),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

/**
 * Fetch a single agent by ID (includes deployments).
 */
export function useAgent(agentId: string) {
  return useQuery({
    queryKey: agentKeys.detail(agentId),
    queryFn: ({ signal }) => fetchAgent(agentId, signal),
    enabled: Boolean(agentId),
    staleTime: 30 * 1000,
  })
}

/**
 * Create a new agent.
 */
export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: CreateAgentParams): Promise<Agent> => {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to create agent')
      }
      const json = await res.json()
      return json.data
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
    },
  })
}

/**
 * Update an agent's name, description, or config.
 */
export function useUpdateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ agentId, ...body }: UpdateAgentParams): Promise<Agent> => {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to update agent')
      }
      const json = await res.json()
      return json.data
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(variables.agentId) })
    },
  })
}

/**
 * Soft-delete an agent.
 */
export function useDeleteAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ agentId }: { agentId: string }): Promise<void> => {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to delete agent')
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
    },
  })
}

/**
 * Configure a Slack deployment for an agent.
 */
export function useDeployAgentToSlack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      agentId,
      ...body
    }: DeployAgentToSlackParams): Promise<AgentDeploymentRow> => {
      const res = await fetch(`/api/agents/${agentId}/deployments/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to deploy agent to Slack')
      }
      const json = await res.json()
      return json.data
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(variables.agentId) })
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
    },
  })
}

export interface SlackChannel {
  id: string
  name: string
  isPrivate: boolean
}

/**
 * Fetch accessible Slack channels for a given Slack OAuth credential.
 */
export function useSlackChannels(credentialId: string) {
  return useQuery({
    queryKey: agentKeys.slackChannels(credentialId),
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/tools/slack/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialId }),
        signal,
      })
      if (!res.ok) return [] as SlackChannel[]
      const data = (await res.json()) as { channels?: SlackChannel[] }
      return data.channels ?? []
    },
    enabled: Boolean(credentialId),
    staleTime: 60 * 1000,
  })
}

/**
 * Remove the Slack deployment from an agent.
 */
export function useUndeployAgentFromSlack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ agentId }: { agentId: string }): Promise<void> => {
      const res = await fetch(`/api/agents/${agentId}/deployments/slack`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to undeploy agent from Slack')
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(variables.agentId) })
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
    },
  })
}

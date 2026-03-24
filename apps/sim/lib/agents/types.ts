import type { Message, SkillInput, ToolInput } from '@/executor/handlers/agent/types'

export type { Message, SkillInput, ToolInput }

/**
 * Core agent configuration, stored as JSONB in the `agent` table.
 * Mirrors the subBlock fields of the AgentBlock definition.
 */
export interface AgentConfig {
  /** System and user prompt messages */
  messages?: Message[]
  /** LLM model identifier */
  model?: string
  /** Tools available to the agent */
  tools?: ToolInput[]
  /** Skills available to the agent */
  skills?: SkillInput[]
  /** Memory strategy */
  memoryType?: 'none' | 'conversation' | 'sliding_window' | 'sliding_window_tokens'
  /** Conversation ID for grouping memory records (required for non-none memory types) */
  conversationId?: string
  /** Number of messages to retain for sliding_window memory */
  slidingWindowSize?: string
  /** Max tokens to retain for sliding_window_tokens memory */
  slidingWindowTokens?: string
  /** LLM temperature (0–2) */
  temperature?: number
  /** Maximum output tokens */
  maxTokens?: number
  /** JSON schema string for structured output */
  responseFormat?: string
  /** Per-agent provider API key override (encrypted at rest) */
  apiKey?: string
  /** Reasoning effort for supported models */
  reasoningEffort?: string
  /** Verbosity for supported models */
  verbosity?: string
  /** Thinking level for supported models */
  thinkingLevel?: string
  azureEndpoint?: string
  azureApiVersion?: string
  vertexProject?: string
  vertexLocation?: string
  vertexCredential?: string
  bedrockAccessKeyId?: string
  bedrockSecretKey?: string
  bedrockRegion?: string
  /** Previous interaction ID for multi-turn deep research follow-ups */
  previousInteractionId?: string
}

/**
 * Slack-specific deployment configuration, stored as JSONB in
 * the `agent_deployment.config` field when platform = 'slack'.
 */
export interface SlackDeploymentConfig {
  /** Slack workspace (team) ID from OAuth */
  teamId: string
  /** The bot's Slack user ID (U...) from oauth.v2.access, used for mention stripping */
  botUserId: string
  /** Channel IDs the agent listens in (unused when respondTo is 'dm') */
  channelIds: string[]
  /** Which events trigger the agent */
  respondTo: 'mentions' | 'all' | 'threads' | 'dm'
  /** Optional display name override for the bot (requires chat:write.customize scope) */
  botName?: string
  /** Whether to reply inside the thread (true) or in the channel (false). Default true. */
  replyInThread: boolean
}

/**
 * Agent row as returned from the API.
 */
export interface AgentRow {
  id: string
  workspaceId: string
  createdBy: string
  name: string
  description?: string | null
  config: AgentConfig
  isDeployed: boolean
  deployedAt?: string | null
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Agent deployment row as returned from the API.
 */
export interface AgentDeploymentRow {
  id: string
  agentId: string
  platform: 'slack'
  credentialId?: string | null
  config: SlackDeploymentConfig
  isActive: boolean
  createdAt: string
  updatedAt: string
}

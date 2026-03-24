import { createLogger } from '@sim/logger'
import { v4 as uuidv4 } from 'uuid'
import type { AgentConfig } from '@/lib/agents/types'
import type { BlockOutput } from '@/blocks/types'
import { BlockType } from '@/executor/constants'
import { AgentBlockHandler } from '@/executor/handlers/agent/agent-handler'
import type { AgentInputs } from '@/executor/handlers/agent/types'
import type { ExecutionContext, StreamingExecution } from '@/executor/types'
import type { SerializedBlock } from '@/serializer/types'

const logger = createLogger('AgentExecutor')

const handler = new AgentBlockHandler()

/**
 * Minimal synthetic block that satisfies AgentBlockHandler.canHandle().
 */
const SYNTHETIC_AGENT_BLOCK: SerializedBlock = {
  id: 'agent',
  position: { x: 0, y: 0 },
  metadata: { id: BlockType.AGENT },
  config: { tool: BlockType.AGENT, params: {} },
  inputs: {},
  outputs: {},
  enabled: true,
}

export interface ExecuteAgentOptions {
  /** The stored agent configuration */
  config: AgentConfig
  /** User message to inject */
  message: string
  /** Memory conversation ID (namespaced by caller) */
  conversationId?: string
  /** IDs for execution context */
  agentId: string
  workspaceId: string
  userId?: string
  /** Whether this is an authenticated deployment (API/Slack) vs. UI test */
  isDeployedContext?: boolean
  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal
}

/**
 * Executes a standalone agent by constructing an ExecutionContext and
 * AgentInputs from the stored config, then calling AgentBlockHandler directly.
 */
export async function executeAgent(
  options: ExecuteAgentOptions
): Promise<BlockOutput | StreamingExecution> {
  const {
    config,
    message,
    conversationId,
    agentId,
    workspaceId,
    userId,
    isDeployedContext = false,
    abortSignal,
  } = options

  const executionId = uuidv4()

  const ctx: ExecutionContext = {
    workflowId: agentId,
    workspaceId,
    executionId,
    userId,
    isDeployedContext,
    blockStates: new Map(),
    executedBlocks: new Set(),
    blockLogs: [],
    metadata: { duration: 0, startTime: new Date().toISOString() },
    environmentVariables: {},
    decisions: { router: new Map(), condition: new Map() },
    completedLoops: new Set(),
    activeExecutionPath: new Set(),
    abortSignal,
  }

  const existingMessages = config.messages ?? []
  const messages = [...existingMessages, { role: 'user' as const, content: message }]

  const inputs: AgentInputs = {
    messages,
    model: config.model,
    tools: config.tools,
    skills: config.skills,
    memoryType: config.memoryType,
    conversationId: conversationId ?? config.conversationId,
    slidingWindowSize: config.slidingWindowSize,
    slidingWindowTokens: config.slidingWindowTokens,
    temperature: config.temperature?.toString(),
    maxTokens: config.maxTokens?.toString(),
    responseFormat: config.responseFormat,
    apiKey: config.apiKey,
    reasoningEffort: config.reasoningEffort,
    verbosity: config.verbosity,
    thinkingLevel: config.thinkingLevel,
    azureEndpoint: config.azureEndpoint,
    azureApiVersion: config.azureApiVersion,
    vertexProject: config.vertexProject,
    vertexLocation: config.vertexLocation,
    vertexCredential: config.vertexCredential,
    bedrockAccessKeyId: config.bedrockAccessKeyId,
    bedrockSecretKey: config.bedrockSecretKey,
    bedrockRegion: config.bedrockRegion,
  }

  logger.info(`Executing agent ${agentId}`, { executionId, workspaceId, isDeployedContext })

  return handler.execute(ctx, SYNTHETIC_AGENT_BLOCK, inputs)
}

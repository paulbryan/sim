import crypto from 'crypto'
import { db } from '@sim/db'
import { account, agent, agentConversation, agentDeployment, credential } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { executeAgent } from '@/lib/agents/execute'
import type { AgentConfig, SlackDeploymentConfig } from '@/lib/agents/types'
import { env } from '@/lib/core/config/env'
import { generateRequestId } from '@/lib/core/utils/request'
import { handleSlackChallenge } from '@/lib/webhooks/utils.server'

const logger = createLogger('AgentSlackWebhook')

export const dynamic = 'force-dynamic'

/** Verify the Slack request signature using HMAC-SHA256. */
async function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  timestamp: string,
  signature: string
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number.parseInt(timestamp, 10)) > 300) return false

  const baseString = `v0:${timestamp}:${rawBody}`
  const hmac = crypto.createHmac('sha256', signingSecret)
  hmac.update(baseString)
  const computed = `v0=${hmac.digest('hex')}`
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
}

/**
 * Consume a StreamingExecution ReadableStream (SSE-formatted).
 * Calls onChunk with (delta, accumulated) on each new token.
 * Returns the final complete text.
 */
async function consumeAgentStream(
  stream: ReadableStream,
  onChunk?: (delta: string, accumulated: string) => void | Promise<void>
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let accumulated = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return accumulated
      try {
        const parsed = JSON.parse(data) as { content?: string }
        if (parsed.content) {
          const delta = parsed.content
          accumulated += delta
          await onChunk?.(delta, accumulated)
        }
      } catch {}
    }
  }
  return accumulated
}

/** Call Slack's chat.postMessage. Returns the message ts or null on failure. */
async function postMessage(
  botToken: string,
  payload: {
    channel: string
    text: string
    thread_ts?: string
    username?: string
  }
): Promise<string | null> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as { ok: boolean; ts?: string; error?: string }
  if (!data.ok) {
    logger.warn('chat.postMessage failed', { error: data.error })
    return null
  }
  return data.ts ?? null
}

/** Call Slack's chat.update. */
async function updateMessage(
  botToken: string,
  channel: string,
  ts: string,
  text: string,
  username?: string
): Promise<void> {
  const res = await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, ts, text, ...(username ? { username } : {}) }),
  })
  const data = (await res.json()) as { ok: boolean; error?: string }
  if (!data.ok) logger.warn('chat.update failed', { error: data.error })
}

/**
 * Start a native Slack stream (Oct 2025 streaming API).
 * Returns the stream ts, or null if unsupported (e.g. Enterprise Grid).
 */
async function startStream(
  botToken: string,
  channel: string,
  threadTs: string,
  recipientUserId: string,
  recipientTeamId: string,
  username?: string
): Promise<string | null> {
  const res = await fetch('https://slack.com/api/chat.startStream', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      recipient_user_id: recipientUserId,
      recipient_team_id: recipientTeamId,
      ...(username ? { username } : {}),
    }),
  })
  const data = (await res.json()) as { ok: boolean; ts?: string; error?: string }
  if (!data.ok) {
    // enterprise_is_restricted = Enterprise Grid; fall back silently
    if (data.error !== 'enterprise_is_restricted') {
      logger.warn('chat.startStream failed', { error: data.error })
    }
    return null
  }
  return data.ts ?? null
}

/** Append a markdown chunk to a native Slack stream. */
async function appendStream(
  botToken: string,
  channel: string,
  ts: string,
  markdownText: string
): Promise<void> {
  const res = await fetch('https://slack.com/api/chat.appendStream', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, ts, markdown_text: markdownText }),
  })
  const data = (await res.json()) as { ok: boolean; error?: string }
  if (!data.ok) logger.warn('chat.appendStream failed', { error: data.error })
}

/** Finalize a native Slack stream. */
async function stopStream(botToken: string, channel: string, ts: string): Promise<void> {
  const res = await fetch('https://slack.com/api/chat.stopStream', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, ts }),
  })
  const data = (await res.json()) as { ok: boolean; error?: string }
  if (!data.ok) logger.warn('chat.stopStream failed', { error: data.error })
}

/**
 * POST /api/agents/slack/webhook
 * Receives Slack event callbacks for all agent deployments.
 * Responds 200 immediately and processes events asynchronously.
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  const signingSecret = env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    logger.error(`[${requestId}] SLACK_SIGNING_SECRET is not configured`)
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? ''
  const signature = request.headers.get('x-slack-signature') ?? ''
  const isValid = await verifySlackSignature(signingSecret, rawBody, timestamp, signature)
  if (!isValid) {
    logger.warn(`[${requestId}] Invalid Slack signature`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const challengeResponse = handleSlackChallenge(body)
  if (challengeResponse) return challengeResponse

  if (body.type !== 'event_callback') {
    return new NextResponse(null, { status: 200 })
  }

  // Deduplicate: if Slack retried (infrastructure-level duplicate delivery), skip
  const retryNum = request.headers.get('x-slack-retry-num')
  if (retryNum) {
    return new NextResponse(null, { status: 200 })
  }

  const event = (body.event ?? {}) as Record<string, unknown>
  const teamId = String(body.team_id ?? '')
  const channel = String(event.channel ?? '')
  const eventTs = String(event.ts ?? '')
  const threadTs = String(event.thread_ts ?? '')
  const text = String(event.text ?? '')
  const userId = String(event.user ?? '')
  const botId = event.bot_id as string | undefined
  const subtype = event.subtype as string | undefined
  const eventType = String(event.type ?? '')

  // Ignore bot messages (our own replies or other bots)
  if (botId || subtype === 'bot_message') {
    return new NextResponse(null, { status: 200 })
  }

  // Respond 200 immediately — Slack never retries a 200, so no header needed
  void processSlackEvent({ requestId, teamId, channel, eventTs, threadTs, text, userId, eventType })

  return new NextResponse(null, { status: 200 })
}

interface SlackEventContext {
  requestId: string
  teamId: string
  channel: string
  eventTs: string
  threadTs: string
  text: string
  userId: string
  eventType: string
}

async function processSlackEvent(ctx: SlackEventContext): Promise<void> {
  const { requestId, teamId, channel, eventTs, threadTs, text, userId, eventType } = ctx

  try {
    const deployments = await db
      .select({ deployment: agentDeployment, agentRow: agent })
      .from(agentDeployment)
      .innerJoin(agent, and(eq(agent.id, agentDeployment.agentId), isNull(agent.archivedAt)))
      .where(and(eq(agentDeployment.platform, 'slack'), eq(agentDeployment.isActive, true)))

    const isDm = channel.startsWith('D')

    const match = deployments.find((row) => {
      const config = row.deployment.config as SlackDeploymentConfig
      if (config.teamId !== teamId) return false

      const respondTo = config.respondTo
      if (respondTo === 'dm') return isDm
      if (!config.channelIds.includes(channel)) return false
      if (respondTo === 'mentions' && eventType !== 'app_mention') return false
      if (respondTo === 'threads' && !threadTs) return false
      return true
    })

    if (!match) {
      logger.info(`[${requestId}] No agent matched for team=${teamId} channel=${channel}`)
      return
    }

    const { deployment, agentRow } = match
    const agentId = agentRow.id
    const workspaceId = agentRow.workspaceId
    const config = deployment.config as SlackDeploymentConfig

    let botToken: string | undefined
    if (deployment.credentialId) {
      const [row] = await db
        .select({ accessToken: account.accessToken })
        .from(credential)
        .innerJoin(account, eq(account.id, credential.accountId))
        .where(eq(credential.id, deployment.credentialId))
        .limit(1)
      botToken = row?.accessToken ?? undefined
    }

    if (!botToken) {
      logger.warn(`[${requestId}] No bot token for agent ${agentId}`)
      return
    }

    // Thread → thread-scoped memory; DM or main channel → channel-scoped memory
    const externalId = threadTs ? `${channel}:${threadTs}` : channel
    const conversationId = `agent:${agentId}:slack:${externalId}`

    await db
      .insert(agentConversation)
      .values({
        id: uuidv4(),
        agentId,
        platform: 'slack',
        externalId,
        conversationId,
        metadata: { channel, threadTs, teamId },
      })
      .onConflictDoUpdate({
        target: [
          agentConversation.agentId,
          agentConversation.platform,
          agentConversation.externalId,
        ],
        set: { updatedAt: new Date(), metadata: { channel, threadTs, teamId } },
      })

    // Strip bot mention (use stored botUserId if available, else strip any @mention)
    const mentionPattern = config.botUserId
      ? new RegExp(`<@${config.botUserId}>`, 'g')
      : /<@[UW][A-Z0-9]+>/g
    const cleanedText = text.replace(mentionPattern, '').trim()
    if (!cleanedText) return

    const replyInThread = config.replyInThread !== false
    const replyThreadTs = replyInThread ? threadTs || eventTs : undefined
    const botName = config.botName || undefined

    logger.info(`[${requestId}] Executing agent ${agentId} for Slack event`, {
      channel,
      threadTs,
      eventType,
    })

    const timeout = AbortSignal.timeout(30_000)
    const result = await executeAgent({
      config: agentRow.config as AgentConfig,
      message: cleanedText,
      conversationId,
      agentId,
      workspaceId,
      isDeployedContext: true,
      abortSignal: timeout,
    })

    const streamingResult =
      result && typeof result === 'object' && 'stream' in result
        ? (result as { stream: ReadableStream }).stream
        : null

    let responseText: string

    if (streamingResult instanceof ReadableStream) {
      responseText = await streamResponse({
        botToken,
        channel,
        replyThreadTs,
        teamId,
        userId,
        botName,
        stream: streamingResult,
        requestId,
      })
    } else {
      responseText = String((result as Record<string, unknown>).content ?? '')
      if (responseText) {
        await postMessage(botToken, {
          channel,
          text: responseText,
          thread_ts: replyThreadTs,
          ...(botName ? { username: botName } : {}),
        })
      }
    }

    if (!responseText) {
      await postMessage(botToken, {
        channel,
        text: '_No response._',
        thread_ts: replyThreadTs,
        ...(botName ? { username: botName } : {}),
      })
      return
    }

    logger.info(`[${requestId}] Agent ${agentId} responded to Slack event`)
  } catch (error) {
    logger.error(`[${requestId}] Error processing Slack event`, { error })
  }
}

interface StreamResponseParams {
  botToken: string
  channel: string
  replyThreadTs: string | undefined
  teamId: string
  userId: string
  botName: string | undefined
  stream: ReadableStream
  requestId: string
}

/**
 * Deliver a streaming agent response to Slack.
 *
 * Prefers the native streaming API (chat.startStream / appendStream / stopStream)
 * introduced in October 2025, which renders a real-time typewriter effect in
 * Slack clients and uses the higher Tier 4 rate limit (100+/min).
 *
 * Falls back to chat.postMessage + throttled chat.update (~1/sec) when:
 * - The workspace is on Enterprise Grid (startStream returns enterprise_is_restricted)
 * - No thread context is available (startStream requires thread_ts)
 */
async function streamResponse({
  botToken,
  channel,
  replyThreadTs,
  teamId,
  userId,
  botName,
  stream,
  requestId,
}: StreamResponseParams): Promise<string> {
  // Native streaming API requires a thread context
  if (replyThreadTs) {
    const streamTs = await startStream(botToken, channel, replyThreadTs, userId, teamId, botName)

    if (streamTs) {
      // Native streaming path — Tier 4 (100+/min), flush every ~600ms
      let pendingDelta = ''
      let lastFlushTime = 0

      const responseText = await consumeAgentStream(stream, async (delta) => {
        pendingDelta += delta
        const now = Date.now()
        if (now - lastFlushTime >= 600 && pendingDelta) {
          lastFlushTime = now
          const toSend = pendingDelta
          pendingDelta = ''
          await appendStream(botToken, channel, streamTs, toSend)
        }
      })

      // Flush remaining buffer
      if (pendingDelta) {
        await appendStream(botToken, channel, streamTs, pendingDelta)
      }
      await stopStream(botToken, channel, streamTs)

      logger.info(`[${requestId}] Streamed via native streaming API`)
      return responseText
    }
  }

  // Fallback: post placeholder → throttled chat.update (~1/sec, Tier 3)
  const placeholderTs = await postMessage(botToken, {
    channel,
    text: '_Thinking…_',
    thread_ts: replyThreadTs,
    ...(botName ? { username: botName } : {}),
  })

  let lastUpdateTime = 0
  const responseText = await consumeAgentStream(stream, async (_, accumulated) => {
    const now = Date.now()
    if (placeholderTs && now - lastUpdateTime >= 1200) {
      lastUpdateTime = now
      void updateMessage(botToken, channel, placeholderTs, `${accumulated} ▌`, botName)
    }
  })

  if (placeholderTs) {
    await updateMessage(botToken, channel, placeholderTs, responseText || '_No response._', botName)
  } else if (responseText) {
    await postMessage(botToken, {
      channel,
      text: responseText,
      thread_ts: replyThreadTs,
      ...(botName ? { username: botName } : {}),
    })
  }

  logger.info(`[${requestId}] Streamed via chat.update fallback`)
  return responseText
}

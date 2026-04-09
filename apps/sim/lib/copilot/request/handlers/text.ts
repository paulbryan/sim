import {
  MothershipStreamV1SpanLifecycleEvent,
  MothershipStreamV1TextChannel,
} from '@/lib/copilot/generated/mothership-stream-v1'
import { getEventData } from '@/lib/copilot/request/sse-utils'
import type { StreamHandler, ToolScope } from './types'
import {
  addContentBlock,
  flushSubagentThinkingBlock,
  flushThinkingBlock,
  getScopedParentToolCallId,
} from './types'

export function handleTextEvent(scope: ToolScope): StreamHandler {
  return (event, context) => {
    const d = getEventData(event)

    if (scope === 'subagent') {
      const parentToolCallId = getScopedParentToolCallId(event, context)
      if (!parentToolCallId) return
      const chunk = d?.text as string | undefined
      if (!chunk) return
      if (d?.channel === MothershipStreamV1TextChannel.thinking) {
        if (!context.currentSubagentThinkingBlock) {
          context.currentSubagentThinkingBlock = {
            type: 'subagent_thinking',
            content: '',
            timestamp: Date.now(),
          }
        }
        context.currentSubagentThinkingBlock.content = `${context.currentSubagentThinkingBlock.content || ''}${chunk}`
        return
      }
      if (context.currentSubagentThinkingBlock) {
        flushSubagentThinkingBlock(context)
      }
      if (context.isInThinkingBlock) {
        flushThinkingBlock(context)
      }
      context.subAgentContent[parentToolCallId] =
        (context.subAgentContent[parentToolCallId] || '') + chunk
      addContentBlock(context, { type: 'subagent_text', content: chunk })
      return
    }

    if (d?.channel === MothershipStreamV1TextChannel.thinking) {
      const phase = d.phase as string | undefined
      if (phase === MothershipStreamV1SpanLifecycleEvent.start) {
        if (context.isInThinkingBlock) {
          flushThinkingBlock(context)
        }
        context.isInThinkingBlock = true
        context.currentThinkingBlock = {
          type: 'thinking',
          content: '',
          timestamp: Date.now(),
        }
        return
      }
      if (phase === MothershipStreamV1SpanLifecycleEvent.end) {
        flushThinkingBlock(context)
        return
      }
      const chunk = d?.text as string | undefined
      if (!chunk) return
      if (!context.currentThinkingBlock) {
        context.currentThinkingBlock = {
          type: 'thinking',
          content: '',
          timestamp: Date.now(),
        }
        context.isInThinkingBlock = true
      }
      context.currentThinkingBlock.content = `${context.currentThinkingBlock.content || ''}${chunk}`
      return
    }

    const chunk = d?.text as string | undefined
    if (!chunk) return
    if (context.isInThinkingBlock) {
      flushThinkingBlock(context)
    }
    context.accumulatedContent += chunk
    addContentBlock(context, { type: 'text', content: chunk })
  }
}

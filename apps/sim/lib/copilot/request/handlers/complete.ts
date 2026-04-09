import { asRecord, getEventData } from '@/lib/copilot/request/sse-utils'
import type { StreamHandler } from './types'
import { flushSubagentThinkingBlock, flushThinkingBlock } from './types'

export const handleCompleteEvent: StreamHandler = (event, context) => {
  const d = getEventData(event)
  flushSubagentThinkingBlock(context)
  flushThinkingBlock(context)
  if (!d) {
    context.streamComplete = true
    return
  }

  if (d.usage) {
    const u = asRecord(d.usage)
    context.usage = {
      prompt: (context.usage?.prompt || 0) + ((u.input_tokens as number) || 0),
      completion: (context.usage?.completion || 0) + ((u.output_tokens as number) || 0),
    }
  }

  if (d.cost) {
    const c = asRecord(d.cost)
    context.cost = {
      input: (context.cost?.input || 0) + ((c.input as number) || 0),
      output: (context.cost?.output || 0) + ((c.output as number) || 0),
      total: (context.cost?.total || 0) + ((c.total as number) || 0),
    }
  }

  context.streamComplete = true
}

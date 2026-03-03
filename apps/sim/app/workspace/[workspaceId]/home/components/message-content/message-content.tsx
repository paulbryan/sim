'use client'

import { Check, CircleAlert, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/core/utils/cn'
import type { ContentBlock, ToolCallStatus } from '../../types'

const REMARK_PLUGINS = [remarkGfm]
const ICON_BASE = 'h-[12px] w-[12px] flex-shrink-0'

function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'executing':
      return <Loader2 className={cn(ICON_BASE, 'animate-spin text-[var(--text-tertiary)]')} />
    case 'success':
      return <Check className={cn(ICON_BASE, 'text-emerald-500')} />
    case 'error':
      return <CircleAlert className={cn(ICON_BASE, 'text-red-400')} />
  }
}

function formatToolName(name: string): string {
  return name
    .replace(/_v\d+$/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

interface TextSegment {
  type: 'text'
  content: string
}

interface ActionSegment {
  type: 'action'
  id: string
  label: string
  status: ToolCallStatus
}

type MessageSegment = TextSegment | ActionSegment

/**
 * Flattens raw content blocks into a uniform list of text and action segments.
 * Tool calls and subagents are treated identically as action items.
 */
function parseBlocks(blocks: ContentBlock[], isStreaming: boolean): MessageSegment[] {
  const segments: MessageSegment[] = []
  const lastSubagentIdx = blocks.findLastIndex((b) => b.type === 'subagent')

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]

    switch (block.type) {
      case 'text': {
        if (block.content?.trim()) {
          const last = segments[segments.length - 1]
          if (last?.type === 'text') {
            last.content += block.content
          } else {
            segments.push({ type: 'text', content: block.content })
          }
        }
        break
      }
      case 'subagent': {
        if (block.content) {
          segments.push({
            type: 'action',
            id: `subagent-${i}`,
            label: block.content,
            status: isStreaming && i === lastSubagentIdx ? 'executing' : 'success',
          })
        }
        break
      }
      case 'tool_call': {
        if (block.toolCall) {
          segments.push({
            type: 'action',
            id: block.toolCall.id,
            label: block.toolCall.displayTitle || formatToolName(block.toolCall.name),
            status: block.toolCall.status,
          })
        }
        break
      }
    }
  }

  return segments
}

interface MessageContentProps {
  blocks: ContentBlock[]
  fallbackContent: string
  isStreaming: boolean
}

export function MessageContent({ blocks, fallbackContent, isStreaming }: MessageContentProps) {
  const parsed = blocks.length > 0 ? parseBlocks(blocks, isStreaming) : []

  const segments: MessageSegment[] =
    parsed.length > 0
      ? parsed
      : fallbackContent?.trim()
        ? [{ type: 'text' as const, content: fallbackContent }]
        : []

  if (segments.length === 0) return null

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === 'text') {
          return (
            <div
              key={`text-${i}`}
              className='prose prose-neutral prose-sm dark:prose-invert max-w-none'
            >
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{segment.content}</ReactMarkdown>
            </div>
          )
        }

        return (
          <div key={segment.id} className='flex items-center gap-[8px] py-[4px]'>
            <StatusIcon status={segment.status} />
            <span className='text-[13px] text-[var(--text-secondary)]'>{segment.label}</span>
          </div>
        )
      })}
    </>
  )
}

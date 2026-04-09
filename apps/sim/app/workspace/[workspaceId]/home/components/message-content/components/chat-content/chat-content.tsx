'use client'

import { type ComponentPropsWithoutRef, useMemo } from 'react'
import { code } from '@streamdown/code'
import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'
import { Checkbox } from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import {
  PendingTagIndicator,
  parseSpecialTags,
  SpecialTags,
} from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags'
import { useStreamingText } from '@/hooks/use-streaming-text'

const PROSE_CLASSES = cn(
  'prose prose-base dark:prose-invert max-w-none',
  'font-[family-name:var(--font-inter)] antialiased break-words font-[430] tracking-[0]',
  'prose-headings:font-[600] prose-headings:tracking-[0] prose-headings:text-[var(--text-primary)]',
  'prose-headings:mb-3 prose-headings:mt-6 first:prose-headings:mt-0',
  'prose-p:text-base prose-p:leading-[25px] prose-p:text-[var(--text-primary)]',
  'prose-li:text-base prose-li:leading-[25px] prose-li:text-[var(--text-primary)]',
  'prose-li:my-1',
  'prose-ul:my-4 prose-ol:my-4',
  'prose-strong:font-[600] prose-strong:text-[var(--text-primary)]',
  'prose-a:text-[var(--text-primary)] prose-a:underline prose-a:decoration-dashed prose-a:underline-offset-4',
  'prose-code:rounded prose-code:bg-[var(--surface-5)] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-small prose-code:font-mono prose-code:font-[400] prose-code:text-[var(--text-primary)]',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-hr:border-[var(--divider)] prose-hr:my-6',
  'prose-table:my-0'
)

type TdProps = ComponentPropsWithoutRef<'td'>
type ThProps = ComponentPropsWithoutRef<'th'>

const STREAMDOWN_PLUGINS = { code }

const MARKDOWN_COMPONENTS = {
  table({ children }: { children?: React.ReactNode }) {
    return (
      <div className='not-prose my-4 w-full overflow-x-auto [&_strong]:font-[600]'>
        <table className='min-w-full border-collapse [&_tbody_tr:last-child_td]:border-b-0'>
          {children}
        </table>
      </div>
    )
  },
  thead({ children }: { children?: React.ReactNode }) {
    return <thead>{children}</thead>
  },
  th({ children, style }: ThProps) {
    return (
      <th
        style={style}
        className='whitespace-nowrap border-[var(--divider)] border-b px-3 py-2 text-left font-[600] text-[var(--text-primary)] text-sm leading-6'
      >
        {children}
      </th>
    )
  },
  td({ children, style }: TdProps) {
    return (
      <td
        style={style}
        className='whitespace-nowrap border-[var(--divider)] border-b px-3 py-2 text-[var(--text-primary)] text-sm leading-6'
      >
        {children}
      </td>
    )
  },
  a({ children, href }: { children?: React.ReactNode; href?: string }) {
    return (
      <a
        href={href}
        className='text-[var(--text-primary)] underline decoration-dashed underline-offset-4'
        target='_blank'
        rel='noopener noreferrer'
      >
        {children}
      </a>
    )
  },
  ul({ children, className }: { children?: React.ReactNode; className?: string }) {
    if (className?.includes('contains-task-list')) {
      return <ul className='my-4 list-none space-y-2 pl-0'>{children}</ul>
    }
    return <ul className='my-4 list-disc pl-5 marker:text-[var(--text-primary)]'>{children}</ul>
  },
  ol({ children }: { children?: React.ReactNode }) {
    return <ol className='my-4 list-decimal pl-5 marker:text-[var(--text-primary)]'>{children}</ol>
  },
  li({ children, className }: { children?: React.ReactNode; className?: string }) {
    if (className?.includes('task-list-item')) {
      return (
        <li className='flex list-none items-start gap-2 text-[var(--text-primary)] text-base leading-[25px] [&>p:only-child]:inline [&>p]:my-0'>
          {children}
        </li>
      )
    }
    return (
      <li className='my-1 text-[var(--text-primary)] text-base leading-[25px] marker:text-[var(--text-primary)] [&>p:only-child]:inline [&>p]:my-0'>
        {children}
      </li>
    )
  },
  input({ type, checked }: { type?: string; checked?: boolean }) {
    if (type === 'checkbox') {
      return <Checkbox checked={checked || false} disabled size='sm' className='mt-1.5 shrink-0' />
    }
    return <input type={type} checked={checked} readOnly />
  },
}

interface ChatContentProps {
  content: string
  isStreaming?: boolean
  onOptionSelect?: (id: string) => void
}

export function ChatContent({ content, isStreaming = false, onOptionSelect }: ChatContentProps) {
  const rendered = useStreamingText(content, isStreaming)

  const parsed = useMemo(() => parseSpecialTags(rendered, isStreaming), [rendered, isStreaming])
  const hasSpecialContent = parsed.hasPendingTag || parsed.segments.some((s) => s.type !== 'text')

  if (hasSpecialContent) {
    return (
      <div className='space-y-3'>
        {parsed.segments.map((segment, i) => {
          if (segment.type === 'text' || segment.type === 'thinking') {
            return (
              <div
                key={`${segment.type}-${i}`}
                className={cn(PROSE_CLASSES, '[&>:first-child]:mt-0 [&>:last-child]:mb-0')}
              >
                <Streamdown
                  mode='static'
                  plugins={STREAMDOWN_PLUGINS}
                  components={MARKDOWN_COMPONENTS}
                >
                  {segment.content}
                </Streamdown>
              </div>
            )
          }
          return (
            <SpecialTags key={`special-${i}`} segment={segment} onOptionSelect={onOptionSelect} />
          )
        })}
        {parsed.hasPendingTag && isStreaming && <PendingTagIndicator />}
      </div>
    )
  }

  return (
    <div className={cn(PROSE_CLASSES, '[&>:first-child]:mt-0 [&>:last-child]:mb-0')}>
      <Streamdown
        isAnimating={isStreaming}
        animated
        plugins={STREAMDOWN_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {rendered}
      </Streamdown>
    </div>
  )
}

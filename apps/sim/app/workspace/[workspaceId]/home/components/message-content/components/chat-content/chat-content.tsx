'use client'

import { type ComponentPropsWithoutRef, useMemo } from 'react'
import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-markup'
import '@/components/emcn/components/code/code.css'
import { Checkbox, highlight, languages } from '@/components/emcn'
import { CopyCodeButton } from '@/components/ui/copy-code-button'
import { cn } from '@/lib/core/utils/cn'
import { extractTextContent } from '@/lib/core/utils/react-node-text'
import {
  PendingTagIndicator,
  parseSpecialTags,
  SpecialTags,
} from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags'
import { useStreamingText } from '@/hooks/use-streaming-text'

const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  jsx: 'javascript',
  sh: 'bash',
  shell: 'bash',
  html: 'markup',
  xml: 'markup',
  yml: 'yaml',
  py: 'python',
}

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
  'prose-hr:border-[var(--divider)] prose-hr:my-6',
  'prose-table:my-0'
)

type TdProps = ComponentPropsWithoutRef<'td'>
type ThProps = ComponentPropsWithoutRef<'th'>

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
  code({ children, className }: { children?: React.ReactNode; className?: string }) {
    const langMatch = className?.match(/language-(\w+)/)
    const language = langMatch ? langMatch[1] : ''
    const codeString = extractTextContent(children)

    if (!codeString) {
      return (
        <pre className='not-prose my-6 overflow-x-auto rounded-lg bg-[var(--surface-5)] p-4 font-[430] font-mono text-[var(--text-primary)] text-small leading-[21px] dark:bg-[var(--code-bg)]'>
          <code>{children}</code>
        </pre>
      )
    }

    const resolved = LANG_ALIASES[language] || language || 'javascript'
    const grammar = languages[resolved] || languages.javascript
    const html = highlight(codeString.trimEnd(), grammar, resolved)

    return (
      <div className='not-prose my-6 overflow-hidden rounded-lg border border-[var(--divider)]'>
        <div className='flex items-center justify-between border-[var(--divider)] border-b bg-[var(--surface-4)] px-4 py-2 dark:bg-[var(--surface-4)]'>
          <span className='text-[var(--text-tertiary)] text-xs'>{language || 'code'}</span>
          <CopyCodeButton
            code={codeString}
            className='text-[var(--text-tertiary)] hover:bg-[var(--surface-5)] hover:text-[var(--text-secondary)]'
          />
        </div>
        <div className='code-editor-theme bg-[var(--surface-5)] dark:bg-[var(--code-bg)]'>
          <pre
            className='m-0 overflow-x-auto whitespace-pre p-4 font-[430] font-mono text-[var(--text-primary)] text-small leading-[21px]'
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
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
  inlineCode({ children }: { children?: React.ReactNode }) {
    return (
      <code className='rounded bg-[var(--surface-5)] px-1.5 py-0.5 font-[400] font-mono text-[var(--text-primary)] text-small before:content-none after:content-none'>
        {children}
      </code>
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
                <Streamdown mode='static' components={MARKDOWN_COMPONENTS}>
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
        mode={isStreaming ? undefined : 'static'}
        isAnimating={isStreaming}
        animated={isStreaming}
        components={MARKDOWN_COMPONENTS}
      >
        {rendered}
      </Streamdown>
    </div>
  )
}

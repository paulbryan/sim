import { useMemo } from 'react'
import { PillsRing } from '@/components/emcn'
import { FunctionExecute } from '@/lib/copilot/generated/tool-catalog-v1'
import type { ToolCallStatus } from '../../../../types'
import { getToolIcon } from '../../utils'

function CircleCheck({ className }: { className?: string }) {
  return (
    <svg
      width='16'
      height='16'
      viewBox='0 0 16 16'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
    >
      <circle cx='8' cy='8' r='6.5' stroke='currentColor' strokeWidth='1.25' />
      <path
        d='M5.5 8.5L7 10L10.5 6.5'
        stroke='currentColor'
        strokeWidth='1.25'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

export function CircleStop({ className }: { className?: string }) {
  return (
    <svg
      width='16'
      height='16'
      viewBox='0 0 16 16'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
    >
      <circle cx='8' cy='8' r='6.5' stroke='currentColor' strokeWidth='1.25' />
      <rect x='6' y='6' width='4' height='4' rx='0.5' fill='currentColor' />
    </svg>
  )
}

function StatusIcon({ status, toolName }: { status: ToolCallStatus; toolName: string }) {
  if (status === 'executing') {
    return <PillsRing className='h-[15px] w-[15px] text-[var(--text-tertiary)]' animate />
  }
  if (status === 'cancelled') {
    return <CircleStop className='h-[15px] w-[15px] text-[var(--text-tertiary)]' />
  }
  const Icon = getToolIcon(toolName)
  if (Icon) {
    return <Icon className='h-[15px] w-[15px] text-[var(--text-tertiary)]' />
  }
  return <CircleCheck className='h-[15px] w-[15px] text-[var(--text-tertiary)]' />
}

const LANG_ALIASES: Record<string, string> = {
  javascript: 'javascript',
  python: 'python',
  shell: 'bash',
  bash: 'bash',
}

function extractFunctionExecutePreview(raw: string): { code: string; lang: string } | null {
  if (!raw) return null
  const langMatch = raw.match(/"language"\s*:\s*"(\w+)"/)
  const lang = langMatch ? (LANG_ALIASES[langMatch[1]] ?? langMatch[1]) : 'javascript'

  const codeStart = raw.indexOf('"code"')
  if (codeStart === -1) return null
  const colonIdx = raw.indexOf(':', codeStart + 6)
  if (colonIdx === -1) return null
  const quoteIdx = raw.indexOf('"', colonIdx + 1)
  if (quoteIdx === -1) return null

  let value = raw.slice(quoteIdx + 1)
  if (value.endsWith('"}') || value.endsWith('"\n}')) {
    value = value.replace(/"\s*\}?\s*$/, '')
  }
  if (value.endsWith('"')) {
    value = value.slice(0, -1)
  }

  const code = value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

  return code.length > 0 ? { code, lang } : null
}

interface ToolCallItemProps {
  toolName: string
  displayTitle: string
  status: ToolCallStatus
  streamingArgs?: string
}

export function ToolCallItem({ toolName, displayTitle, status, streamingArgs }: ToolCallItemProps) {
  const extracted = useMemo(() => {
    if (toolName !== FunctionExecute.id || !streamingArgs) return null
    return extractFunctionExecutePreview(streamingArgs)
  }, [toolName, streamingArgs])
  const markdown = useMemo(
    () => (extracted ? `\`\`\`${extracted.lang}\n${extracted.code}\n\`\`\`` : null),
    [extracted]
  )

  return (
    <div className='flex flex-col pl-[24px]'>
      <div className='flex items-center gap-[8px]'>
        <div className='flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center'>
          <StatusIcon status={status} toolName={toolName} />
        </div>
        <span className='font-base text-[13px] text-[var(--text-secondary)]'>{displayTitle}</span>
      </div>
      {/* {markdown && (
        <div className='ml-[24px] max-h-[300px] overflow-auto'>
          <ChatContent content={markdown} isStreaming={status === 'executing'} />
        </div>
      )} */}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '@sim/logger'
import { Paperclip, Square } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, X } from '@/components/emcn/icons'
import { getDocumentIcon } from '@/components/icons/document-icons'
import { cn } from '@/lib/core/utils/cn'
import { CHAT_ACCEPT_ATTRIBUTE } from '@/lib/uploads/utils/validation'

const logger = createLogger('AgentTestPanel')

const MAX_FILES = 10
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.sh',
])
const TEXT_MEDIA_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
  'application/xml',
  'text/xml',
])

interface AttachedFile {
  id: string
  name: string
  size: number
  type: string
  file: File
  previewUrl?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  attachments?: Array<{ id: string; name: string; type: string; previewUrl?: string }>
}

interface AgentTestPanelProps {
  agentId: string
}

function isTextFile(file: { type: string; name: string }) {
  if (TEXT_MEDIA_TYPES.has(file.type)) return true
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  return TEXT_EXTENSIONS.has(ext)
}

function StreamingCursor() {
  return (
    <span className='ml-[1px] inline-block h-[13px] w-[5px] translate-y-[1px] animate-pulse bg-current opacity-60' />
  )
}

function FilePill({
  name,
  type,
  previewUrl,
  onRemove,
}: {
  name: string
  type: string
  previewUrl?: string
  onRemove?: () => void
}) {
  const isImage = type.startsWith('image/')
  const Icon = getDocumentIcon(type, name)

  if (isImage && previewUrl) {
    return (
      <div className='group relative h-[44px] w-[44px] flex-shrink-0 overflow-hidden rounded-[6px]'>
        <img src={previewUrl} alt={name} className='h-full w-full object-cover' />
        {onRemove && (
          <button
            type='button'
            onClick={onRemove}
            className='absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100'
            aria-label={`Remove ${name}`}
          >
            <X className='h-[11px] w-[11px] text-white' />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className='flex max-w-[160px] items-center gap-[4px] rounded-[6px] bg-[var(--surface-4)] px-[7px] py-[3px]'>
      <Icon className='h-[11px] w-[11px] flex-shrink-0 text-[var(--text-muted)]' />
      <span className='min-w-0 truncate text-[11px] text-[var(--text-primary)]'>{name}</span>
      {onRemove && (
        <button
          type='button'
          onClick={onRemove}
          className='ml-[2px] flex-shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          aria-label={`Remove ${name}`}
        >
          <X className='h-[9px] w-[9px]' />
        </button>
      )}
    </div>
  )
}

function UserMessage({ message }: { message: ChatMessage }) {
  const hasAttachments = (message.attachments?.length ?? 0) > 0
  return (
    <div className='flex w-full flex-col items-end gap-[4px]'>
      {hasAttachments && (
        <div className='flex flex-wrap justify-end gap-[5px]'>
          {message.attachments!.map((att) => (
            <FilePill key={att.id} name={att.name} type={att.type} previewUrl={att.previewUrl} />
          ))}
        </div>
      )}
      {message.content && (
        <div className='max-w-[85%] rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-4)] px-[10px] py-[7px]'>
          <p className='whitespace-pre-wrap break-words font-medium text-[13px] text-[var(--text-primary)] leading-[1.5]'>
            {message.content}
          </p>
        </div>
      )}
    </div>
  )
}

const REMARK_PLUGINS = [remarkGfm]

const PROSE_CLASSES = cn(
  'prose prose-sm dark:prose-invert max-w-none',
  'prose-p:text-[13px] prose-p:leading-[1.6] prose-p:text-[var(--text-primary)] first:prose-p:mt-0 last:prose-p:mb-0',
  'prose-headings:text-[var(--text-primary)] prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2',
  'prose-li:text-[13px] prose-li:text-[var(--text-primary)] prose-li:my-0.5',
  'prose-ul:my-2 prose-ol:my-2',
  'prose-strong:text-[var(--text-primary)] prose-strong:font-semibold',
  'prose-a:text-[var(--text-primary)] prose-a:underline prose-a:decoration-dashed prose-a:underline-offset-2',
  'prose-code:rounded prose-code:bg-[var(--surface-4)] prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:font-mono prose-code:text-[var(--text-primary)]',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:bg-[var(--surface-4)] prose-pre:border prose-pre:border-[var(--border-1)] prose-pre:rounded-[6px] prose-pre:text-[12px]',
  'prose-blockquote:border-[var(--border-1)] prose-blockquote:text-[var(--text-muted)]'
)

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className='w-full pl-[2px]'>
      {message.isStreaming && !message.content ? (
        <span className='text-[13px] text-[var(--text-tertiary)]'>
          Thinking…
          <StreamingCursor />
        </span>
      ) : message.content ? (
        <div className={PROSE_CLASSES}>
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{message.content}</ReactMarkdown>
          {message.isStreaming && <StreamingCursor />}
        </div>
      ) : null}
    </div>
  )
}

export function AgentTestPanel({ agentId }: AgentTestPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const conversationIdRef = useRef(`test-${Date.now()}`)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      // Revoke any object URLs created for image previews
      for (const f of attachedFiles) {
        if (f.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(f.previewUrl)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const syncHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [])

  const addFiles = useCallback((files: File[]) => {
    setAttachedFiles((current) => {
      const slots = Math.max(0, MAX_FILES - current.length)
      const next: AttachedFile[] = []

      for (const file of files.slice(0, slots)) {
        if (file.size > MAX_FILE_SIZE) continue
        if ([...current, ...next].some((f) => f.name === file.name && f.size === file.size))
          continue

        const attached: AttachedFile = {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type,
          file,
        }

        if (file.type.startsWith('image/')) {
          attached.previewUrl = URL.createObjectURL(file)
        }

        next.push(attached)
      }

      return [...current, ...next]
    })
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(Array.from(e.target.files))
      e.target.value = ''
    },
    [addFiles]
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if ((!trimmed && attachedFiles.length === 0) || isLoading) return

    const files = [...attachedFiles]
    setInput('')
    setAttachedFiles([])
    setIsLoading(true)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Inject text file contents into the message
    let messageText = trimmed
    const textFiles = files.filter(isTextFile)
    if (textFiles.length > 0) {
      const contents = await Promise.all(
        textFiles.map(
          (f) =>
            new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onload = (ev) => resolve(`\n\n--- ${f.name} ---\n${ev.target?.result ?? ''}`)
              reader.onerror = () => resolve('')
              reader.readAsText(f.file)
            })
        )
      )
      messageText = (trimmed + contents.join('')).trim()
    } else if (!trimmed && files.length > 0) {
      messageText = files.map((f) => f.name).join(', ')
    }

    const attachments = files.map(({ id, name, type, previewUrl }) => ({
      id,
      name,
      type,
      previewUrl,
    }))
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: trimmed, attachments },
      { role: 'assistant', content: '', isStreaming: true },
    ])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`/api/agents/${agentId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: messageText, conversationId: conversationIdRef.current }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Execution failed')
      }

      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let accumulated = ''

        outer: while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') break outer
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) {
                accumulated += parsed.content
                setMessages((prev) => {
                  const next = [...prev]
                  next[next.length - 1] = {
                    role: 'assistant',
                    content: accumulated,
                    isStreaming: true,
                  }
                  return next
                })
              }
            } catch {}
          }
        }
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: accumulated, isStreaming: false }
          return next
        })
      } else {
        const json = await res.json()
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = {
            role: 'assistant',
            content: json.data?.content ?? '',
            isStreaming: false,
          }
          return next
        })
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, isStreaming: false }
          return next
        })
        return
      }
      logger.error('Agent execution failed', { error })
      const msg = error instanceof Error ? error.message : 'Something went wrong'
      setMessages((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: `Error: ${msg}`, isStreaming: false }
        return next
      })
    } finally {
      setIsLoading(false)
      abortRef.current = null
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [agentId, input, attachedFiles, isLoading])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const canSend = (input.trim().length > 0 || attachedFiles.length > 0) && !isLoading

  return (
    <div
      className='flex h-full flex-col bg-[var(--surface-1)]'
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        addFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <div className='flex flex-shrink-0 items-center justify-between border-[var(--border-1)] border-b px-[16px] py-[10px]'>
        <span className='font-medium text-[13px] text-[var(--text-primary)]'>Test</span>
        {messages.length > 0 && (
          <button
            type='button'
            onClick={() => {
              setMessages([])
              setAttachedFiles([])
              conversationIdRef.current = `test-${Date.now()}`
            }}
            className='text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]'
          >
            Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} className='flex-1 overflow-y-auto px-[20px] py-[20px]'>
        {messages.length === 0 ? (
          <div className='flex h-full flex-col items-center justify-center gap-[6px]'>
            <p className='text-[13px] text-[var(--text-muted)]'>
              Send a message to test your agent.
            </p>
            <p className='text-[11px] text-[var(--text-tertiary)]'>
              ↵ to send · Shift+↵ for new line
            </p>
          </div>
        ) : (
          <div className='flex flex-col gap-[20px]'>
            {messages.map((msg, idx) =>
              msg.role === 'user' ? (
                <UserMessage key={idx} message={msg} />
              ) : (
                <AssistantMessage key={idx} message={msg} />
              )
            )}
          </div>
        )}
      </div>

      <div className='flex-shrink-0 p-[12px]'>
        <div className='rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-5)]'>
          {attachedFiles.length > 0 && (
            <div className='flex flex-wrap gap-[5px] px-[10px] pt-[8px]'>
              {attachedFiles.map((file) => (
                <FilePill
                  key={file.id}
                  name={file.name}
                  type={file.type}
                  previewUrl={file.previewUrl}
                  onRemove={() => {
                    if (file.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(file.previewUrl)
                    setAttachedFiles((prev) => prev.filter((f) => f.id !== file.id))
                  }}
                />
              ))}
            </div>
          )}

          <div className='flex items-end px-[10px] py-[6px]'>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                syncHeight()
              }}
              onKeyDown={handleKeyDown}
              placeholder='Send a message…'
              rows={1}
              disabled={isLoading}
              className={cn(
                'max-h-[180px] min-h-[24px] flex-1 resize-none bg-transparent py-[2px] text-[13px] text-[var(--text-primary)] leading-[1.5]',
                'placeholder:text-[var(--text-tertiary)] focus:outline-none disabled:opacity-50',
                'overflow-hidden'
              )}
            />
          </div>

          <div className='flex items-center justify-between px-[8px] pb-[6px]'>
            <button
              type='button'
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className='flex h-[26px] w-[26px] items-center justify-center rounded-[4px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-4)] hover:text-[var(--text-primary)] disabled:opacity-40'
              aria-label='Attach file'
            >
              <Paperclip className='h-[13px] w-[13px]' />
            </button>

            <button
              type='button'
              onClick={isLoading ? handleStop : handleSend}
              disabled={!isLoading && !canSend}
              className={cn(
                'flex h-[26px] w-[26px] items-center justify-center rounded-[4px] transition-colors',
                isLoading
                  ? 'bg-[var(--surface-4)] text-[var(--text-primary)] hover:bg-[var(--border-1)]'
                  : canSend
                    ? 'bg-[var(--text-primary)] text-[var(--surface-1)] hover:opacity-85'
                    : 'cursor-not-allowed text-[var(--text-tertiary)]'
              )}
              aria-label={isLoading ? 'Stop' : 'Send'}
            >
              {isLoading ? (
                <Square className='h-[10px] w-[10px]' />
              ) : (
                <Send className='h-[12px] w-[12px]' />
              )}
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type='file'
        multiple
        className='hidden'
        onChange={handleFileChange}
        accept={CHAT_ACCEPT_ATTRIBUTE}
      />
    </div>
  )
}

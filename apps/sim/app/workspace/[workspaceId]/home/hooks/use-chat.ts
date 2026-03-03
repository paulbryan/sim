import { useCallback, useRef, useState } from 'react'
import { MOTHERSHIP_CHAT_API_PATH } from '@/lib/copilot/constants'
import type { ChatMessage, ContentBlock, SSEPayload, SSEPayloadData } from '../types'
import { SUBAGENT_LABELS } from '../types'

export interface UseChatReturn {
  messages: ChatMessage[]
  isSending: boolean
  error: string | null
  sendMessage: (message: string) => Promise<void>
  stopGeneration: () => void
  chatBottomRef: React.RefObject<HTMLDivElement | null>
}

function getPayloadData(payload: SSEPayload): SSEPayloadData | undefined {
  return typeof payload.data === 'object' ? payload.data : undefined
}

export function useChat(workspaceId: string): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const chatIdRef = useRef<string | undefined>(undefined)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || !workspaceId) return

      setError(null)
      setIsSending(true)

      const userMessageId = crypto.randomUUID()
      const assistantId = crypto.randomUUID()

      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: 'user', content: message },
        { id: assistantId, role: 'assistant', content: '', contentBlocks: [] },
      ])

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      const blocks: ContentBlock[] = []
      const toolMap = new Map<string, number>()

      const ensureTextBlock = (): ContentBlock => {
        const last = blocks[blocks.length - 1]
        if (last?.type === 'text') return last
        const b: ContentBlock = { type: 'text', content: '' }
        blocks.push(b)
        return b
      }

      const flush = () => {
        const text = blocks
          .filter((b) => b.type === 'text')
          .map((b) => b.content ?? '')
          .join('')
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: text, contentBlocks: [...blocks] } : m
          )
        )
      }

      try {
        const response = await fetch(MOTHERSHIP_CHAT_API_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            workspaceId,
            userMessageId,
            createNewChat: !chatIdRef.current,
            ...(chatIdRef.current ? { chatId: chatIdRef.current } : {}),
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Request failed: ${response.status}`)
        }

        if (!response.body) throw new Error('No response body')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6)

            let parsed: SSEPayload
            try {
              parsed = JSON.parse(raw)
            } catch {
              continue
            }

            switch (parsed.type) {
              case 'chat_id': {
                if (parsed.chatId) chatIdRef.current = parsed.chatId
                break
              }
              case 'content': {
                const chunk = typeof parsed.data === 'string' ? parsed.data : (parsed.content ?? '')
                if (chunk) {
                  const tb = ensureTextBlock()
                  tb.content = (tb.content ?? '') + chunk
                  flush()
                }
                break
              }
              case 'tool_generating':
              case 'tool_call': {
                const id = parsed.toolCallId
                const data = getPayloadData(parsed)
                const name = parsed.toolName || data?.name || 'unknown'
                if (!id) break
                const ui = parsed.ui || data?.ui
                if (ui?.hidden) break
                const displayTitle = ui?.title || ui?.phaseLabel
                if (!toolMap.has(id)) {
                  toolMap.set(id, blocks.length)
                  blocks.push({
                    type: 'tool_call',
                    toolCall: { id, name, status: 'executing', displayTitle },
                  })
                } else {
                  const idx = toolMap.get(id)!
                  const tc = blocks[idx].toolCall
                  if (tc) {
                    tc.name = name
                    if (displayTitle) tc.displayTitle = displayTitle
                  }
                }
                flush()
                break
              }
              case 'tool_result': {
                const id = parsed.toolCallId || getPayloadData(parsed)?.id
                if (!id) break
                const idx = toolMap.get(id)
                if (idx !== undefined && blocks[idx].toolCall) {
                  blocks[idx].toolCall!.status = parsed.success ? 'success' : 'error'
                  flush()
                }
                break
              }
              case 'tool_error': {
                const id = parsed.toolCallId || getPayloadData(parsed)?.id
                if (!id) break
                const idx = toolMap.get(id)
                if (idx !== undefined && blocks[idx].toolCall) {
                  blocks[idx].toolCall!.status = 'error'
                  flush()
                }
                break
              }
              case 'subagent_start': {
                const name = parsed.subagent || getPayloadData(parsed)?.agent
                if (name) {
                  blocks.push({ type: 'subagent', content: SUBAGENT_LABELS[name] || name })
                  flush()
                }
                break
              }
              case 'subagent_end': {
                flush()
                break
              }
              case 'error': {
                setError(parsed.error || 'An error occurred')
                break
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        const msg = err instanceof Error ? err.message : 'Failed to send message'
        setError(msg)
      } finally {
        setIsSending(false)
        abortControllerRef.current = null
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    },
    [workspaceId]
  )

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsSending(false)
  }, [])

  return { messages, isSending, error, sendMessage, stopGeneration, chatBottomRef }
}

'use client'

import { useCallback, useRef, useState } from 'react'
import { createLogger } from '@sim/logger'

const logger = createLogger('AgentWand')

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface UseAgentWandOptions {
  /** System prompt passed verbatim to /api/wand. Use {context} as a placeholder for the current value. */
  systemPrompt: string
  generationType?: string
  maintainHistory?: boolean
  currentValue: string
  onGeneratedContent: (content: string) => void
}

export interface AgentWandState {
  isSearchActive: boolean
  searchQuery: string
  isStreaming: boolean
  searchInputRef: React.RefObject<HTMLInputElement | null>
  onSearchClick: () => void
  onSearchBlur: () => void
  onSearchChange: (value: string) => void
  onSearchSubmit: () => void
  onSearchCancel: () => void
}

export function useAgentWand({
  systemPrompt,
  generationType,
  maintainHistory = false,
  currentValue,
  onGeneratedContent,
}: UseAgentWandOptions): AgentWandState {
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const searchQueryRef = useRef(searchQuery)
  searchQueryRef.current = searchQuery

  const onSearchClick = useCallback(() => {
    setIsSearchActive(true)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [])

  const onSearchBlur = useCallback(() => {
    if (!searchQueryRef.current.trim() && !abortRef.current) {
      setIsSearchActive(false)
    }
  }, [])

  const onSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
  }, [])

  const onSearchCancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsSearchActive(false)
    setSearchQuery('')
    setIsStreaming(false)
  }, [])

  const onSearchSubmit = useCallback(async () => {
    const prompt = searchQueryRef.current
    if (!prompt.trim()) return

    const resolvedSystemPrompt = systemPrompt.replace('{context}', currentValue)

    setSearchQuery('')
    setIsSearchActive(false)
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/wand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemPrompt: resolvedSystemPrompt,
          stream: true,
          generationType,
          history: maintainHistory ? history : [],
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error('Wand generation failed')

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
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.done) break outer
            if (parsed.chunk) {
              accumulated += parsed.chunk
              onGeneratedContent(accumulated)
            }
          } catch {}
        }
      }

      if (maintainHistory) {
        setHistory((prev) => [
          ...prev,
          { role: 'user', content: prompt },
          { role: 'assistant', content: accumulated },
        ])
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        logger.error('Wand generation failed', { error })
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [systemPrompt, generationType, maintainHistory, currentValue, history, onGeneratedContent])

  return {
    isSearchActive,
    searchQuery,
    isStreaming,
    searchInputRef,
    onSearchClick,
    onSearchBlur,
    onSearchChange,
    onSearchSubmit,
    onSearchCancel,
  }
}

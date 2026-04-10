'use client'

import { memo, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from 'react-simple-code-editor'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-yaml'
import { createLogger } from '@sim/logger'
import { ZoomIn, ZoomOut } from 'lucide-react'
import {
  CODE_LINE_HEIGHT_PX,
  Code as CodeEditor,
  calculateGutterWidth,
  getCodeEditorProps,
  highlight,
  languages,
  Skeleton,
} from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import type { WorkspaceFileRecord } from '@/lib/uploads/contexts/workspace'
import { getFileExtension } from '@/lib/uploads/utils/file-utils'
import { SUPPORTED_CODE_EXTENSIONS } from '@/lib/uploads/utils/validation'
import {
  useUpdateWorkspaceFileContent,
  useWorkspaceFileBinary,
  useWorkspaceFileContent,
} from '@/hooks/queries/workspace-files'
import { useAutosave } from '@/hooks/use-autosave'
import { DataTable } from './data-table'
import { PreviewPanel, resolvePreviewType } from './preview-panel'

const logger = createLogger('FileViewer')

const SPLIT_MIN_PCT = 20
const SPLIT_MAX_PCT = 80
const SPLIT_DEFAULT_PCT = 50

const TEXT_EDITABLE_MIME_TYPES = new Set([
  'text/markdown',
  'text/plain',
  'application/json',
  'application/x-yaml',
  'text/csv',
  'text/html',
  'text/xml',
  'application/xml',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/typescript',
  'application/toml',
  'text/x-python',
  'text/x-sh',
  'text/x-sql',
  'image/svg+xml',
])

const TEXT_EDITABLE_EXTENSIONS = new Set([
  'md',
  'txt',
  'json',
  'yaml',
  'yml',
  'csv',
  'html',
  'htm',
  'svg',
  ...SUPPORTED_CODE_EXTENSIONS,
])

const IFRAME_PREVIEWABLE_MIME_TYPES = new Set(['application/pdf', 'text/x-pdflibjs'])
const IFRAME_PREVIEWABLE_EXTENSIONS = new Set(['pdf'])

const IMAGE_PREVIEWABLE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const IMAGE_PREVIEWABLE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

const PPTX_PREVIEWABLE_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/x-pptxgenjs',
])
const PPTX_PREVIEWABLE_EXTENSIONS = new Set(['pptx'])

const DOCX_PREVIEWABLE_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/x-docxjs',
])
const DOCX_PREVIEWABLE_EXTENSIONS = new Set(['docx'])

const XLSX_PREVIEWABLE_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const XLSX_PREVIEWABLE_EXTENSIONS = new Set(['xlsx'])

type FileCategory =
  | 'text-editable'
  | 'iframe-previewable'
  | 'image-previewable'
  | 'pptx-previewable'
  | 'docx-previewable'
  | 'xlsx-previewable'
  | 'unsupported'

type CodeEditorLanguage =
  | 'javascript'
  | 'json'
  | 'python'
  | 'typescript'
  | 'bash'
  | 'css'
  | 'markup'
  | 'sql'
  | 'yaml'

const CODE_EDITOR_LANGUAGE_BY_EXTENSION: Partial<Record<string, CodeEditorLanguage>> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  json: 'json',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  css: 'css',
  scss: 'css',
  less: 'css',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  svg: 'markup',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
}

const CODE_EDITOR_LANGUAGE_BY_MIME: Partial<Record<string, CodeEditorLanguage>> = {
  'text/javascript': 'javascript',
  'application/javascript': 'javascript',
  'text/typescript': 'typescript',
  'application/typescript': 'typescript',
  'text/x-python': 'python',
  'application/json': 'json',
  'text/x-shellscript': 'bash',
  'text/css': 'css',
  'text/html': 'markup',
  'text/xml': 'markup',
  'application/xml': 'markup',
  'image/svg+xml': 'markup',
  'text/x-sql': 'sql',
  'application/x-yaml': 'yaml',
}

const CODE_EDITOR_LINE_HEIGHT_PX = CODE_LINE_HEIGHT_PX

function resolveFileCategory(mimeType: string | null, filename: string): FileCategory {
  if (mimeType && TEXT_EDITABLE_MIME_TYPES.has(mimeType)) return 'text-editable'
  if (mimeType && IFRAME_PREVIEWABLE_MIME_TYPES.has(mimeType)) return 'iframe-previewable'
  if (mimeType && IMAGE_PREVIEWABLE_MIME_TYPES.has(mimeType)) return 'image-previewable'
  if (mimeType && DOCX_PREVIEWABLE_MIME_TYPES.has(mimeType)) return 'docx-previewable'
  if (mimeType && PPTX_PREVIEWABLE_MIME_TYPES.has(mimeType)) return 'pptx-previewable'
  if (mimeType && XLSX_PREVIEWABLE_MIME_TYPES.has(mimeType)) return 'xlsx-previewable'

  const ext = getFileExtension(filename)
  const nameKey = ext || filename.toLowerCase()
  if (TEXT_EDITABLE_EXTENSIONS.has(nameKey)) return 'text-editable'
  if (IFRAME_PREVIEWABLE_EXTENSIONS.has(ext)) return 'iframe-previewable'
  if (IMAGE_PREVIEWABLE_EXTENSIONS.has(ext)) return 'image-previewable'
  if (DOCX_PREVIEWABLE_EXTENSIONS.has(ext)) return 'docx-previewable'
  if (PPTX_PREVIEWABLE_EXTENSIONS.has(ext)) return 'pptx-previewable'
  if (XLSX_PREVIEWABLE_EXTENSIONS.has(ext)) return 'xlsx-previewable'

  return 'unsupported'
}

export function isTextEditable(file: { type: string; name: string }): boolean {
  return resolveFileCategory(file.type, file.name) === 'text-editable'
}

export function isPreviewable(file: { type: string; name: string }): boolean {
  return resolvePreviewType(file.type, file.name) !== null
}

export type PreviewMode = 'editor' | 'split' | 'preview'

interface FileViewerProps {
  file: WorkspaceFileRecord
  workspaceId: string
  canEdit: boolean
  showPreview?: boolean
  previewMode?: PreviewMode
  autoFocus?: boolean
  onDirtyChange?: (isDirty: boolean) => void
  onSaveStatusChange?: (status: 'idle' | 'saving' | 'saved' | 'error') => void
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>
  streamingContent?: string
  streamingMode?: 'append' | 'replace'
  disableStreamingAutoScroll?: boolean
  useCodeRendererForCodeFiles?: boolean
}

function isCodeFile(file: { type: string; name: string }): boolean {
  const ext = getFileExtension(file.name)
  return (
    SUPPORTED_CODE_EXTENSIONS.includes(ext as (typeof SUPPORTED_CODE_EXTENSIONS)[number]) ||
    ext === 'html' ||
    ext === 'htm' ||
    ext === 'xml' ||
    ext === 'svg'
  )
}

function resolveCodeEditorLanguage(file: { type: string; name: string }): CodeEditorLanguage {
  const ext = getFileExtension(file.name)
  return (
    CODE_EDITOR_LANGUAGE_BY_EXTENSION[ext] ??
    CODE_EDITOR_LANGUAGE_BY_MIME[file.type] ??
    (ext === 'json' ? 'json' : 'javascript')
  )
}

export function FileViewer({
  file,
  workspaceId,
  canEdit,
  showPreview,
  previewMode,
  autoFocus,
  onDirtyChange,
  onSaveStatusChange,
  saveRef,
  streamingContent,
  streamingMode,
  disableStreamingAutoScroll = false,
  useCodeRendererForCodeFiles = false,
}: FileViewerProps) {
  const category = resolveFileCategory(file.type, file.name)

  if (category === 'text-editable') {
    return (
      <TextEditor
        file={file}
        workspaceId={workspaceId}
        canEdit={canEdit}
        previewMode={previewMode ?? (showPreview ? 'preview' : 'editor')}
        autoFocus={autoFocus}
        onDirtyChange={onDirtyChange}
        onSaveStatusChange={onSaveStatusChange}
        saveRef={saveRef}
        streamingContent={streamingContent}
        streamingMode={streamingMode}
        disableStreamingAutoScroll={disableStreamingAutoScroll}
        useCodeRendererForCodeFiles={useCodeRendererForCodeFiles}
      />
    )
  }

  if (category === 'iframe-previewable') {
    return <IframePreview file={file} workspaceId={workspaceId} />
  }

  if (category === 'image-previewable') {
    return <ImagePreview file={file} />
  }

  if (category === 'docx-previewable') {
    return <DocxPreview file={file} workspaceId={workspaceId} />
  }

  if (category === 'pptx-previewable') {
    return <PptxPreview file={file} workspaceId={workspaceId} streamingContent={streamingContent} />
  }

  if (category === 'xlsx-previewable') {
    return <XlsxPreview file={file} workspaceId={workspaceId} />
  }

  return <UnsupportedPreview file={file} />
}

interface TextEditorProps {
  file: WorkspaceFileRecord
  workspaceId: string
  canEdit: boolean
  previewMode: PreviewMode
  autoFocus?: boolean
  onDirtyChange?: (isDirty: boolean) => void
  onSaveStatusChange?: (status: 'idle' | 'saving' | 'saved' | 'error') => void
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>
  streamingContent?: string
  streamingMode?: 'append' | 'replace'
  disableStreamingAutoScroll: boolean
  useCodeRendererForCodeFiles?: boolean
}

function TextEditor({
  file,
  workspaceId,
  canEdit,
  previewMode,
  autoFocus,
  onDirtyChange,
  onSaveStatusChange,
  saveRef,
  streamingContent,
  streamingMode = 'append',
  disableStreamingAutoScroll,
  useCodeRendererForCodeFiles = false,
}: TextEditorProps) {
  const initializedRef = useRef(false)
  const contentRef = useRef('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const codeEditorRef = useRef<HTMLDivElement>(null)
  const codeScrollRef = useRef<HTMLDivElement>(null)

  const [splitPct, setSplitPct] = useState(SPLIT_DEFAULT_PCT)
  const [isResizing, setIsResizing] = useState(false)
  const [visualLineHeights, setVisualLineHeights] = useState<number[]>([])
  const [activeLineNumber, setActiveLineNumber] = useState(1)

  const {
    data: fetchedContent,
    isLoading,
    error,
    dataUpdatedAt,
  } = useWorkspaceFileContent(
    workspaceId,
    file.id,
    file.key,
    file.type === 'text/x-pptxgenjs' ||
      file.type === 'text/x-docxjs' ||
      file.type === 'text/x-pdflibjs'
  )

  const updateContent = useUpdateWorkspaceFileContent()
  const updateContentRef = useRef(updateContent)
  updateContentRef.current = updateContent

  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const savedContentRef = useRef('')
  const [isStreamInteractionLocked, setIsStreamInteractionLocked] = useState(false)
  const wasStreamingRef = useRef(false)
  const pendingStreamReconcileRef = useRef(false)
  const lastStreamedContentRef = useRef<string | null>(null)
  const shouldUseCodeRenderer = useCodeRendererForCodeFiles && isCodeFile(file)
  const codeLanguage = useMemo(() => resolveCodeEditorLanguage(file), [file])

  useEffect(() => {
    const lastStreamed = lastStreamedContentRef.current
    const hasPendingReconcile = wasStreamingRef.current && pendingStreamReconcileRef.current
    const hasFetchedAdvanced =
      fetchedContent !== undefined && fetchedContent !== savedContentRef.current
    const fetchedMatchesLastStream =
      fetchedContent !== undefined && lastStreamed !== null && fetchedContent === lastStreamed

    if (streamingContent !== undefined) {
      const nextContent =
        streamingMode === 'replace' || fetchedContent === undefined
          ? streamingContent
          : fetchedContent.endsWith(streamingContent) ||
              fetchedContent.endsWith(`\n${streamingContent}`)
            ? fetchedContent
            : `${fetchedContent}\n${streamingContent}`
      const fetchedMatchesNextStream =
        fetchedContent !== undefined && fetchedContent === nextContent

      if (
        hasPendingReconcile &&
        (hasFetchedAdvanced || fetchedMatchesLastStream || fetchedMatchesNextStream)
      ) {
        pendingStreamReconcileRef.current = false
        wasStreamingRef.current = false
        lastStreamedContentRef.current = null
        setIsStreamInteractionLocked(false)
        setContent(fetchedContent)
        contentRef.current = fetchedContent
        setSavedContent(fetchedContent)
        savedContentRef.current = fetchedContent
        initializedRef.current = true
        return
      }

      wasStreamingRef.current = true
      setIsStreamInteractionLocked(true)
      if (nextContent === contentRef.current) {
        pendingStreamReconcileRef.current = true
        lastStreamedContentRef.current = nextContent
        initializedRef.current = true
        return
      }
      pendingStreamReconcileRef.current = true
      lastStreamedContentRef.current = nextContent
      setContent(nextContent)
      contentRef.current = nextContent
      initializedRef.current = true
      return
    }

    if (hasPendingReconcile) {
      if (hasFetchedAdvanced || fetchedMatchesLastStream) {
        pendingStreamReconcileRef.current = false
        wasStreamingRef.current = false
        lastStreamedContentRef.current = null
        setIsStreamInteractionLocked(false)
        setContent(fetchedContent)
        contentRef.current = fetchedContent
        setSavedContent(fetchedContent)
        savedContentRef.current = fetchedContent
        return
      }
    }

    if (streamingContent === undefined) {
      setIsStreamInteractionLocked(false)
    }

    if (fetchedContent === undefined) return

    if (!initializedRef.current) {
      setContent(fetchedContent)
      setSavedContent(fetchedContent)
      savedContentRef.current = fetchedContent
      contentRef.current = fetchedContent
      initializedRef.current = true

      if (autoFocus) {
        requestAnimationFrame(() => {
          const editorTextarea = codeEditorRef.current?.querySelector('textarea')
          if (editorTextarea instanceof HTMLTextAreaElement) {
            editorTextarea.focus()
            return
          }
          textareaRef.current?.focus()
        })
      }
      return
    }

    if (fetchedContent === savedContentRef.current) return
    const isClean = contentRef.current === savedContentRef.current
    if (isClean) {
      setContent(fetchedContent)
      setSavedContent(fetchedContent)
      savedContentRef.current = fetchedContent
      contentRef.current = fetchedContent
    }
  }, [streamingContent, fetchedContent, streamingMode, dataUpdatedAt, autoFocus])

  const handleContentChange = useCallback((value: string) => {
    setContent(value)
    contentRef.current = value
  }, [])

  const onSave = useCallback(async () => {
    const currentContent = contentRef.current
    if (currentContent === savedContentRef.current) return

    await updateContentRef.current.mutateAsync({
      workspaceId,
      fileId: file.id,
      content: currentContent,
    })
    setSavedContent(currentContent)
    savedContentRef.current = currentContent
  }, [workspaceId, file.id])

  const { saveStatus, saveImmediately, isDirty } = useAutosave({
    content,
    savedContent,
    onSave,
    enabled: canEdit && initializedRef.current && streamingContent === undefined,
  })

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(() => {
    onSaveStatusChange?.(saveStatus)
  }, [saveStatus, onSaveStatusChange])

  if (saveRef) saveRef.current = saveImmediately
  useEffect(
    () => () => {
      if (saveRef) saveRef.current = null
    },
    [saveRef]
  )

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPct(Math.min(SPLIT_MAX_PCT, Math.max(SPLIT_MIN_PCT, pct)))
    }

    const handleMouseUp = () => setIsResizing(false)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  const handleCheckboxToggle = useCallback(
    (checkboxIndex: number, checked: boolean) => {
      const toggled = toggleMarkdownCheckbox(contentRef.current, checkboxIndex, checked)
      if (toggled !== contentRef.current) {
        handleContentChange(toggled)
      }
    },
    [handleContentChange]
  )

  const isStreaming = isStreamInteractionLocked
  const isEditorReadOnly = isStreamInteractionLocked || !canEdit
  const renderedContent = content
  const gutterWidthPx = useMemo(() => {
    const lineCount = renderedContent.split('\n').length
    return calculateGutterWidth(lineCount)
  }, [renderedContent])
  const sharedCodeEditorProps = useMemo(
    () =>
      getCodeEditorProps({
        disabled: !canEdit,
      }),
    [canEdit]
  )
  const highlightCode = useMemo(() => {
    return (value: string) => {
      const grammar = languages[codeLanguage] || languages.javascript
      return highlight(value, grammar, codeLanguage)
    }
  }, [codeLanguage])
  const handleCodeContentChange = useCallback(
    (value: string) => {
      if (isEditorReadOnly) return
      handleContentChange(value)
    },
    [handleContentChange, isEditorReadOnly]
  )

  const textareaStuckRef = useRef(true)

  useEffect(() => {
    if (!shouldUseCodeRenderer || !codeEditorRef.current) return

    const setCodeEditorReadOnly = () => {
      const textarea = codeEditorRef.current?.querySelector('textarea')
      if (!(textarea instanceof HTMLTextAreaElement)) return
      textarea.readOnly = isEditorReadOnly
      textarea.spellcheck = false
    }

    setCodeEditorReadOnly()

    const timeoutId = setTimeout(setCodeEditorReadOnly, 0)
    const observer = new MutationObserver(setCodeEditorReadOnly)
    observer.observe(codeEditorRef.current, {
      childList: true,
      subtree: true,
    })

    return () => {
      clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [isEditorReadOnly, shouldUseCodeRenderer])

  useEffect(() => {
    if (!shouldUseCodeRenderer) return
    const textarea = codeEditorRef.current?.querySelector('textarea')
    if (!(textarea instanceof HTMLTextAreaElement)) return

    const updateActiveLineNumber = () => {
      const pos = textarea.selectionStart
      const textBeforeCursor = renderedContent.substring(0, pos)
      setActiveLineNumber(textBeforeCursor.split('\n').length)
    }

    updateActiveLineNumber()
    textarea.addEventListener('click', updateActiveLineNumber)
    textarea.addEventListener('keyup', updateActiveLineNumber)
    textarea.addEventListener('focus', updateActiveLineNumber)

    return () => {
      textarea.removeEventListener('click', updateActiveLineNumber)
      textarea.removeEventListener('keyup', updateActiveLineNumber)
      textarea.removeEventListener('focus', updateActiveLineNumber)
    }
  }, [renderedContent, shouldUseCodeRenderer])

  useEffect(() => {
    if (!shouldUseCodeRenderer || !codeEditorRef.current) return

    const calculateVisualLines = () => {
      const preElement = codeEditorRef.current?.querySelector('pre')
      if (!(preElement instanceof HTMLElement)) return

      const lines = renderedContent.split('\n')
      const newVisualLineHeights: number[] = []

      const tempContainer = document.createElement('div')
      tempContainer.style.cssText = `
        position: absolute;
        visibility: hidden;
        height: auto;
        width: ${preElement.clientWidth}px;
        font-family: ${window.getComputedStyle(preElement).fontFamily};
        font-size: ${window.getComputedStyle(preElement).fontSize};
        line-height: ${CODE_EDITOR_LINE_HEIGHT_PX}px;
        padding: 8px;
        white-space: pre-wrap;
        word-break: break-word;
        box-sizing: border-box;
      `
      document.body.appendChild(tempContainer)

      lines.forEach((line) => {
        const lineDiv = document.createElement('div')
        lineDiv.textContent = line || ' '
        tempContainer.appendChild(lineDiv)
        const actualHeight = lineDiv.getBoundingClientRect().height
        const lineUnits = Math.max(1, Math.ceil(actualHeight / CODE_EDITOR_LINE_HEIGHT_PX))
        newVisualLineHeights.push(lineUnits)
        tempContainer.removeChild(lineDiv)
      })

      document.body.removeChild(tempContainer)
      setVisualLineHeights(newVisualLineHeights)
    }

    const timeoutId = setTimeout(calculateVisualLines, 50)
    const resizeObserver = new ResizeObserver(calculateVisualLines)
    resizeObserver.observe(codeEditorRef.current)

    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [renderedContent, shouldUseCodeRenderer])

  const renderCodeLineNumbers = useCallback((): ReactElement[] => {
    const numbers: ReactElement[] = []
    let lineNumber = 1

    visualLineHeights.forEach((height) => {
      const isActive = lineNumber === activeLineNumber
      numbers.push(
        <div
          key={`${lineNumber}-0`}
          className={cn(
            'text-right text-xs tabular-nums leading-[21px]',
            isActive
              ? 'text-[var(--text-primary)] dark:text-[var(--code-foreground)]'
              : 'text-[var(--text-muted)] dark:text-[var(--code-line-number)]'
          )}
        >
          {lineNumber}
        </div>
      )

      for (let i = 1; i < height; i++) {
        numbers.push(
          <div
            key={`${lineNumber}-${i}`}
            className='invisible text-right text-xs tabular-nums leading-[21px]'
          >
            {lineNumber}
          </div>
        )
      }

      lineNumber++
    })

    if (numbers.length === 0) {
      numbers.push(
        <div
          key='1-0'
          className='text-right text-[var(--text-muted)] text-xs tabular-nums leading-[21px] dark:text-[var(--code-line-number)]'
        >
          1
        </div>
      )
    }

    return numbers
  }, [activeLineNumber, visualLineHeights])

  useEffect(() => {
    if (!isStreaming) return
    if (disableStreamingAutoScroll) {
      textareaStuckRef.current = false
      return
    }
    textareaStuckRef.current = true

    const el = (shouldUseCodeRenderer ? codeScrollRef.current : textareaRef.current) ?? null
    if (!el) return

    const onWheel = (e: Event) => {
      if ((e as WheelEvent).deltaY < 0) textareaStuckRef.current = false
    }

    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      if (dist <= 5) textareaStuckRef.current = true
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', onScroll)
    }
  }, [disableStreamingAutoScroll, isStreaming, shouldUseCodeRenderer])

  useEffect(() => {
    if (!isStreaming || !textareaStuckRef.current || disableStreamingAutoScroll) return
    const el = (shouldUseCodeRenderer ? codeScrollRef.current : textareaRef.current) ?? null
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [disableStreamingAutoScroll, isStreaming, renderedContent, shouldUseCodeRenderer])

  if (streamingContent === undefined) {
    if (isLoading) return DOCUMENT_SKELETON

    if (error) {
      return (
        <div className='flex flex-1 items-center justify-center'>
          <p className='text-[13px] text-[var(--text-muted)]'>Failed to load file content</p>
        </div>
      )
    }
  }

  const previewType = resolvePreviewType(file.type, file.name)
  const isIframeRendered = previewType === 'html' || previewType === 'svg'
  const effectiveMode = isStreaming && isIframeRendered ? 'editor' : previewMode
  const showEditor = effectiveMode !== 'preview'
  const showPreviewPane = effectiveMode !== 'editor'

  return (
    <div ref={containerRef} className='relative flex flex-1 overflow-hidden'>
      {showEditor &&
        (shouldUseCodeRenderer ? (
          <div
            style={showPreviewPane ? { width: `${splitPct}%`, flexShrink: 0 } : undefined}
            className={cn(
              'min-w-0',
              !showPreviewPane && 'w-full',
              isResizing && 'pointer-events-none'
            )}
          >
            <div ref={codeScrollRef} className='h-full overflow-auto'>
              <CodeEditor.Container className='min-h-full min-w-full overflow-visible rounded-none border-0 bg-transparent'>
                <CodeEditor.Gutter width={gutterWidthPx}>
                  {renderCodeLineNumbers()}
                </CodeEditor.Gutter>
                <CodeEditor.Content paddingLeft={`${gutterWidthPx}px`} editorRef={codeEditorRef}>
                  <Editor
                    value={renderedContent}
                    onValueChange={handleCodeContentChange}
                    highlight={highlightCode}
                    padding={sharedCodeEditorProps.padding}
                    className={cn(sharedCodeEditorProps.className, 'min-h-full')}
                    textareaClassName={cn(sharedCodeEditorProps.textareaClassName, 'min-h-full')}
                  />
                </CodeEditor.Content>
              </CodeEditor.Container>
            </div>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={renderedContent}
            onChange={(e) => handleContentChange(e.target.value)}
            readOnly={isEditorReadOnly}
            spellCheck={false}
            style={showPreviewPane ? { width: `${splitPct}%`, flexShrink: 0 } : undefined}
            className={cn(
              'h-full resize-none border-0 bg-transparent p-[24px] font-mono text-[14px] text-[var(--text-body)] outline-none placeholder:text-[var(--text-subtle)]',
              !showPreviewPane && 'w-full',
              isResizing && 'pointer-events-none'
            )}
          />
        ))}
      {showPreviewPane && (
        <>
          {showEditor && (
            <div className='relative shrink-0'>
              <div className='h-full w-px bg-[var(--border)]' />
              <div
                className='-left-[3px] absolute top-0 z-10 h-full w-[6px] cursor-col-resize'
                onMouseDown={() => setIsResizing(true)}
                role='separator'
                aria-orientation='vertical'
                aria-label='Resize split'
              />
              {isResizing && (
                <div className='-translate-x-[0.5px] pointer-events-none absolute top-0 z-20 h-full w-[2px] bg-[var(--selection)]' />
              )}
            </div>
          )}
          <div
            className={cn('min-w-0 flex-1 overflow-hidden', isResizing && 'pointer-events-none')}
          >
            <PreviewPanel
              content={renderedContent}
              mimeType={file.type}
              filename={file.name}
              isStreaming={isStreaming}
              onCheckboxToggle={canEdit && !isStreaming ? handleCheckboxToggle : undefined}
            />
          </div>
        </>
      )}
    </div>
  )
}

const IframePreview = memo(function IframePreview({
  file,
  workspaceId,
}: {
  file: WorkspaceFileRecord
  workspaceId: string
}) {
  const { data: fileData, isLoading } = useWorkspaceFileBinary(workspaceId, file.id, file.key)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!fileData) return
    const blob = new Blob([fileData], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [fileData])

  if (isLoading || !blobUrl) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Skeleton className='h-[200px] w-[80%]' />
      </div>
    )
  }

  return (
    <div className='flex flex-1 overflow-hidden'>
      <iframe
        src={blobUrl}
        className='h-full w-full border-0'
        title={file.name}
        onError={() => {
          logger.error(`Failed to load file: ${file.name}`)
        }}
      />
    </div>
  )
})

const ZOOM_MIN = 0.25
const ZOOM_MAX = 4
const ZOOM_WHEEL_SENSITIVITY = 0.005
const ZOOM_BUTTON_FACTOR = 1.2

const clampZoom = (z: number) => Math.min(Math.max(z, ZOOM_MIN), ZOOM_MAX)

const ImagePreview = memo(function ImagePreview({ file }: { file: WorkspaceFileRecord }) {
  const serveUrl = `/api/files/serve/${encodeURIComponent(file.key)}?context=workspace&t=${file.size}`
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetAtDragStart = useRef({ x: 0, y: 0 })
  const offsetRef = useRef(offset)
  offsetRef.current = offset

  const containerRef = useRef<HTMLDivElement>(null)

  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z * ZOOM_BUTTON_FACTOR)), [])
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z / ZOOM_BUTTON_FACTOR)), [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        setZoom((z) => clampZoom(z * Math.exp(-e.deltaY * ZOOM_WHEEL_SENSITIVITY)))
      } else {
        setOffset((o) => ({ x: o.x - e.deltaX, y: o.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    isDragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    offsetAtDragStart.current = offsetRef.current
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return
    setOffset({
      x: offsetAtDragStart.current.x + (e.clientX - dragStart.current.x),
      y: offsetAtDragStart.current.y + (e.clientY - dragStart.current.y),
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    if (containerRef.current) containerRef.current.style.cursor = 'grab'
  }, [])

  useEffect(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [file.key])

  return (
    <div
      ref={containerRef}
      className='relative flex flex-1 cursor-grab overflow-hidden bg-[var(--surface-1)]'
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className='pointer-events-none absolute inset-0 flex items-center justify-center'
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      >
        <img
          src={serveUrl}
          alt={file.name}
          className='max-h-full max-w-full select-none rounded-md object-contain'
          draggable={false}
          loading='eager'
        />
      </div>
      <div
        className='absolute right-4 bottom-4 flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 shadow-sm'
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type='button'
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          className='flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40'
          aria-label='Zoom out'
        >
          <ZoomOut className='h-3.5 w-3.5' />
        </button>
        <span className='min-w-[3rem] text-center text-[11px] text-[var(--text-secondary)]'>
          {Math.round(zoom * 100)}%
        </span>
        <button
          type='button'
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          className='flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40'
          aria-label='Zoom in'
        >
          <ZoomIn className='h-3.5 w-3.5' />
        </button>
      </div>
    </div>
  )
})

function resolvePreviewError(fetchError: Error | null, renderError: string | null): string | null {
  if (fetchError) return fetchError.message
  return renderError
}

function PreviewError({ label, error }: { label: string; error: string }) {
  return (
    <div className='flex flex-1 flex-col items-center justify-center gap-[8px]'>
      <p className='font-medium text-[14px] text-[var(--text-body)]'>Failed to preview {label}</p>
      <p className='text-[13px] text-[var(--text-muted)]'>{error}</p>
    </div>
  )
}

const DOCUMENT_SKELETON = (
  <div className='flex flex-1 flex-col gap-[8px] p-[24px]'>
    <Skeleton className='h-[16px] w-[60%]' />
    <Skeleton className='h-[16px] w-[80%]' />
    <Skeleton className='h-[16px] w-[40%]' />
    <Skeleton className='h-[16px] w-[70%]' />
  </div>
)

const DocxPreview = memo(function DocxPreview({
  file,
  workspaceId,
}: {
  file: WorkspaceFileRecord
  workspaceId: string
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const {
    data: fileData,
    isLoading,
    error: fetchError,
  } = useWorkspaceFileBinary(workspaceId, file.id, file.key)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [docxScale, setDocxScale] = useState(1)
  const [scaledSize, setScaledSize] = useState<{ width: number; height: number } | null>(null)

  const updateDocxScale = useCallback(() => {
    const viewport = viewportRef.current
    const container = containerRef.current
    if (!viewport || !container) return

    const intrinsicWidth = container.scrollWidth
    const intrinsicHeight = container.scrollHeight
    if (intrinsicWidth === 0 || intrinsicHeight === 0) return

    const viewportStyle = window.getComputedStyle(viewport)
    const paddingX =
      Number.parseFloat(viewportStyle.paddingLeft) + Number.parseFloat(viewportStyle.paddingRight)
    const availableWidth = Math.max(viewport.clientWidth - paddingX, 0)
    const nextScale = availableWidth > 0 ? Math.min(1, availableWidth / intrinsicWidth) : 1

    setDocxScale((prev) => (Math.abs(prev - nextScale) < 0.001 ? prev : nextScale))
    setScaledSize((prev) => {
      const next = {
        width: intrinsicWidth * nextScale,
        height: intrinsicHeight * nextScale,
      }
      if (
        prev &&
        Math.abs(prev.width - next.width) < 1 &&
        Math.abs(prev.height - next.height) < 1
      ) {
        return prev
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!containerRef.current || !fileData) return

    let cancelled = false

    async function render() {
      try {
        const { renderAsync } = await import('docx-preview')
        if (cancelled || !containerRef.current) return
        setRenderError(null)
        setDocxScale(1)
        setScaledSize(null)
        containerRef.current.innerHTML = ''
        await renderAsync(fileData, containerRef.current, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
        })
        if (!cancelled) {
          requestAnimationFrame(updateDocxScale)
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to render document'
          logger.error('DOCX render failed', { error: msg })
          setRenderError(msg)
        }
      }
    }

    render()
    return () => {
      cancelled = true
    }
  }, [fileData, updateDocxScale])

  useEffect(() => {
    const viewport = viewportRef.current
    const container = containerRef.current
    if (!viewport || !container) return

    updateDocxScale()

    const resizeObserver = new ResizeObserver(() => {
      updateDocxScale()
    })

    resizeObserver.observe(viewport)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [fileData, updateDocxScale])

  const error = resolvePreviewError(fetchError, renderError)
  if (error) return <PreviewError label='document' error={error} />
  if (isLoading) return DOCUMENT_SKELETON

  return (
    <div ref={viewportRef} className='h-full overflow-auto bg-[var(--surface-1)] p-4 sm:p-6'>
      <div className='flex min-h-full justify-center'>
        <div
          className='shrink-0'
          style={
            scaledSize
              ? {
                  width: scaledSize.width,
                  minHeight: scaledSize.height,
                }
              : undefined
          }
        >
          <div
            ref={containerRef}
            className='origin-top'
            style={{
              transform: `scale(${docxScale})`,
              transformOrigin: 'top center',
            }}
          />
        </div>
      </div>
    </div>
  )
})

const pptxSlideCache = new Map<string, string[]>()

function pptxCacheKey(fileId: string, dataUpdatedAt: number, byteLength: number): string {
  return `${fileId}:${dataUpdatedAt}:${byteLength}`
}

function pptxCacheSet(key: string, slides: string[]): void {
  pptxSlideCache.set(key, slides)
  if (pptxSlideCache.size > 5) {
    const oldest = pptxSlideCache.keys().next().value
    if (oldest !== undefined) pptxSlideCache.delete(oldest)
  }
}

async function renderPptxSlides(
  data: Uint8Array,
  onSlide: (src: string, index: number) => void,
  cancelled: () => boolean
): Promise<void> {
  const { PPTXViewer } = await import('pptxviewjs')
  if (cancelled()) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const { width, height } = await getPptxRenderSize(data, dpr)
  const W = width
  const H = height

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const viewer = new PPTXViewer({ canvas })
  await viewer.loadFile(data)
  const count = viewer.getSlideCount()
  if (cancelled() || count === 0) return

  for (let i = 0; i < count; i++) {
    if (cancelled()) break
    if (i === 0) await viewer.render()
    else await viewer.goToSlide(i)
    onSlide(canvas.toDataURL('image/jpeg', 0.85), i)
  }
}

async function getPptxRenderSize(
  data: Uint8Array,
  dpr: number
): Promise<{ width: number; height: number }> {
  const fallback = {
    width: Math.round(1920 * dpr),
    height: Math.round(1080 * dpr),
  }

  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(data)
    const presentationXml = await zip.file('ppt/presentation.xml')?.async('text')
    if (!presentationXml) return fallback

    const tagMatch = presentationXml.match(/<p:sldSz\s[^>]+>/)
    if (!tagMatch) return fallback
    const tag = tagMatch[0]
    const cxMatch = tag.match(/\bcx="(\d+)"/)
    const cyMatch = tag.match(/\bcy="(\d+)"/)
    if (!cxMatch || !cyMatch) return fallback

    const cx = Number(cxMatch[1])
    const cy = Number(cyMatch[1])
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || cx <= 0 || cy <= 0) return fallback

    const aspectRatio = cx / cy
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return fallback

    const baseLongEdge = 1920 * dpr
    if (aspectRatio >= 1) {
      return {
        width: Math.round(baseLongEdge),
        height: Math.round(baseLongEdge / aspectRatio),
      }
    }

    return {
      width: Math.round(baseLongEdge * aspectRatio),
      height: Math.round(baseLongEdge),
    }
  } catch {
    return fallback
  }
}

function PptxPreview({
  file,
  workspaceId,
  streamingContent,
}: {
  file: WorkspaceFileRecord
  workspaceId: string
  streamingContent?: string
}) {
  const {
    data: fileData,
    isLoading: isFetching,
    error: fetchError,
    dataUpdatedAt,
  } = useWorkspaceFileBinary(workspaceId, file.id, file.key)

  const cacheKey = pptxCacheKey(file.id, dataUpdatedAt, fileData?.byteLength ?? 0)
  const cached = pptxSlideCache.get(cacheKey)

  const [slides, setSlides] = useState<string[]>(cached ?? [])
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)

  const shouldSuppressStreamingPptxError = (message: string): boolean => {
    return (
      message.includes('SyntaxError: Invalid or unexpected token') ||
      message.includes('PPTX generation cancelled') ||
      message.includes('Preview failed') ||
      message.includes('AbortError')
    )
  }

  // Streaming preview: only re-triggers when the streaming source code or
  // workspace changes. Isolated from fileData/dataUpdatedAt so that file-list
  // refreshes don't abort the in-flight compilation request.
  useEffect(() => {
    if (streamingContent === undefined) return

    let cancelled = false
    const controller = new AbortController()

    const debounceTimer = setTimeout(async () => {
      if (cancelled) return
      try {
        setRendering(true)
        setRenderError(null)

        const response = await fetch(`/api/workspaces/${workspaceId}/pptx/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: streamingContent }),
          signal: controller.signal,
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Preview failed' }))
          throw new Error(err.error || 'Preview failed')
        }
        if (cancelled) return
        const arrayBuffer = await response.arrayBuffer()
        if (cancelled) return
        const data = new Uint8Array(arrayBuffer)
        const images: string[] = []
        await renderPptxSlides(
          data,
          (src) => {
            images.push(src)
            if (!cancelled) setSlides([...images])
          },
          () => cancelled
        )
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === 'AbortError')) {
          const msg = err instanceof Error ? err.message : 'Failed to render presentation'
          if (shouldSuppressStreamingPptxError(msg)) {
            logger.info('Suppressing transient PPTX streaming preview error', { error: msg })
          } else {
            logger.error('PPTX render failed', { error: msg })
            setRenderError(msg)
          }
        }
      } finally {
        if (!cancelled) setRendering(false)
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(debounceTimer)
      controller.abort()
    }
  }, [streamingContent, workspaceId])

  // Non-streaming render: uses the fetched binary directly on the client.
  // Skipped while streaming is active so it doesn't interfere.
  useEffect(() => {
    if (streamingContent !== undefined) return

    let cancelled = false

    async function render() {
      if (cancelled) return
      try {
        if (cached) {
          setSlides(cached)
          return
        }

        if (!fileData) return
        setRendering(true)
        setRenderError(null)
        setSlides([])
        const data = new Uint8Array(fileData)
        const images: string[] = []
        await renderPptxSlides(
          data,
          (src) => {
            images.push(src)
            if (!cancelled) setSlides([...images])
          },
          () => cancelled
        )
        if (!cancelled && images.length > 0) {
          pptxCacheSet(cacheKey, images)
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to render presentation'
          logger.error('PPTX render failed', { error: msg })
          setRenderError(msg)
        }
      } finally {
        if (!cancelled) setRendering(false)
      }
    }

    render()

    return () => {
      cancelled = true
    }
  }, [fileData, dataUpdatedAt, streamingContent, cacheKey, workspaceId])

  const error = resolvePreviewError(fetchError, renderError)
  const loading = isFetching || rendering

  if (error) return <PreviewError label='presentation' error={error} />

  if (loading && slides.length === 0) {
    return (
      <div className='flex flex-1 items-center justify-center bg-[var(--surface-1)]'>
        <div className='flex flex-col items-center gap-[8px]'>
          <div
            className='h-[18px] w-[18px] animate-spin rounded-full'
            style={{
              background:
                'conic-gradient(from 0deg, hsl(var(--muted-foreground)) 0deg 120deg, transparent 120deg 180deg, hsl(var(--muted-foreground)) 180deg 300deg, transparent 300deg 360deg)',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 1.5px), black calc(100% - 1.5px))',
              WebkitMask:
                'radial-gradient(farthest-side, transparent calc(100% - 1.5px), black calc(100% - 1.5px))',
            }}
          />
          <p className='text-[13px] text-[var(--text-muted)]'>Loading presentation...</p>
        </div>
      </div>
    )
  }

  return (
    <div className='flex-1 overflow-y-auto bg-[var(--surface-1)] p-[24px]'>
      <div className='mx-auto flex max-w-[960px] flex-col gap-[16px]'>
        {slides.map((src, i) => (
          <img key={i} src={src} alt={`Slide ${i + 1}`} className='w-full rounded-md shadow-lg' />
        ))}
      </div>
    </div>
  )
}

function toggleMarkdownCheckbox(markdown: string, targetIndex: number, checked: boolean): string {
  let currentIndex = 0
  return markdown.replace(/^(\s*(?:[-*+]|\d+[.)]) +)\[([ xX])\]/gm, (match, prefix: string) => {
    if (currentIndex++ !== targetIndex) return match
    return `${prefix}[${checked ? 'x' : ' '}]`
  })
}

const XLSX_MAX_ROWS = 1_000

interface XlsxSheet {
  name: string
  headers: string[]
  rows: string[][]
  truncated: boolean
}

const XlsxPreview = memo(function XlsxPreview({
  file,
  workspaceId,
}: {
  file: WorkspaceFileRecord
  workspaceId: string
}) {
  const {
    data: fileData,
    isLoading,
    error: fetchError,
  } = useWorkspaceFileBinary(workspaceId, file.id, file.key)

  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [currentSheet, setCurrentSheet] = useState<XlsxSheet | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const workbookRef = useRef<import('xlsx').WorkBook | null>(null)

  useEffect(() => {
    if (!fileData) return
    const data = fileData

    let cancelled = false

    async function parse() {
      try {
        setRenderError(null)
        const XLSX = await import('xlsx')
        const workbook = XLSX.read(new Uint8Array(data), { type: 'array' })
        if (!cancelled) {
          workbookRef.current = workbook
          setSheetNames(workbook.SheetNames)
          setActiveSheet(0)
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to parse spreadsheet'
          logger.error('XLSX parse failed', { error: msg })
          setRenderError(msg)
        }
      }
    }

    parse()
    return () => {
      cancelled = true
    }
  }, [fileData])

  useEffect(() => {
    if (sheetNames.length === 0 || !workbookRef.current) return

    let cancelled = false

    async function parseSheet() {
      try {
        const XLSX = await import('xlsx')
        const workbook = workbookRef.current!
        const name = sheetNames[activeSheet]
        const sheet = workbook.Sheets[name]
        const allRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
        const headers = allRows[0] ?? []
        const dataRows = allRows.slice(1)
        const truncated = dataRows.length > XLSX_MAX_ROWS
        if (!cancelled) {
          setCurrentSheet({
            name,
            headers,
            rows: truncated ? dataRows.slice(0, XLSX_MAX_ROWS) : dataRows,
            truncated,
          })
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to parse sheet'
          logger.error('XLSX sheet parse failed', { error: msg })
          setRenderError(msg)
        }
      }
    }

    parseSheet()
    return () => {
      cancelled = true
    }
  }, [sheetNames, activeSheet])

  const error = resolvePreviewError(fetchError, renderError)
  if (error) return <PreviewError label='spreadsheet' error={error} />
  if (isLoading || currentSheet === null) return DOCUMENT_SKELETON

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      {sheetNames.length > 1 && (
        <div className='flex shrink-0 gap-0 border-[var(--border)] border-b bg-[var(--surface-1)]'>
          {sheetNames.map((name, i) => (
            <button
              key={name}
              type='button'
              onClick={() => setActiveSheet(i)}
              className={cn(
                'px-3 py-1.5 text-[12px] transition-colors',
                i === activeSheet
                  ? 'border-[var(--brand-secondary)] border-b-2 font-medium text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className='flex-1 overflow-auto p-6'>
        <DataTable headers={currentSheet.headers} rows={currentSheet.rows} />
        {currentSheet.truncated && (
          <p className='mt-3 text-center text-[12px] text-[var(--text-muted)]'>
            Showing first {XLSX_MAX_ROWS.toLocaleString()} rows. Download the file to view all data.
          </p>
        )}
      </div>
    </div>
  )
})

const UnsupportedPreview = memo(function UnsupportedPreview({
  file,
}: {
  file: WorkspaceFileRecord
}) {
  const ext = getFileExtension(file.name)

  return (
    <div className='flex flex-1 flex-col items-center justify-center gap-[8px]'>
      <p className='font-medium text-[14px] text-[var(--text-body)]'>
        Preview not available{ext ? ` for .${ext} files` : ' for this file'}
      </p>
      <p className='text-[13px] text-[var(--text-muted)]'>
        Use the download button to view this file
      </p>
    </div>
  )
})

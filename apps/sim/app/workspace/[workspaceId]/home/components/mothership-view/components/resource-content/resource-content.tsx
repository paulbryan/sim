'use client'

import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { createLogger } from '@sim/logger'
import { useQueryClient } from '@tanstack/react-query'
import { Square } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button, PlayOutline, Skeleton, Tooltip } from '@/components/emcn'
import {
  Download,
  FileX,
  Folder as FolderIcon,
  SquareArrowUpRight,
  WorkflowX,
} from '@/components/emcn/icons'
import {
  cancelRunToolExecution,
  markRunToolManuallyStopped,
  reportManualRunToolStop,
} from '@/lib/copilot/tools/client/run-tool-execution'
import {
  downloadWorkspaceFile,
  getFileExtension,
  getMimeTypeFromExtension,
} from '@/lib/uploads/utils/file-utils'
import { workflowBorderColor } from '@/lib/workspaces/colors'
import {
  FileViewer,
  type PreviewMode,
} from '@/app/workspace/[workspaceId]/files/components/file-viewer'
import { GenericResourceContent } from '@/app/workspace/[workspaceId]/home/components/mothership-view/components/resource-content/generic-resource-content'
import {
  RESOURCE_TAB_ICON_BUTTON_CLASS,
  RESOURCE_TAB_ICON_CLASS,
} from '@/app/workspace/[workspaceId]/home/components/mothership-view/components/resource-tabs/resource-tab-controls'
import type {
  GenericResourceData,
  MothershipResource,
} from '@/app/workspace/[workspaceId]/home/types'
import { KnowledgeBase } from '@/app/workspace/[workspaceId]/knowledge/[id]/base'
import {
  useUserPermissionsContext,
  useWorkspacePermissionsContext,
} from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import { Table } from '@/app/workspace/[workspaceId]/tables/[tableId]/components'
import { useUsageLimits } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/hooks'
import { useWorkflowExecution } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-workflow-execution'
import { useFolders } from '@/hooks/queries/folders'
import { useWorkflows } from '@/hooks/queries/workflows'
import {
  useWorkspaceFileContent,
  useWorkspaceFiles,
  workspaceFilesKeys,
} from '@/hooks/queries/workspace-files'
import { useSettingsNavigation } from '@/hooks/use-settings-navigation'
import { useExecutionStore } from '@/stores/execution/store'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'

const Workflow = lazy(() => import('@/app/workspace/[workspaceId]/w/[workflowId]/workflow'))

const LOADING_SKELETON = (
  <div className='flex h-full flex-col gap-2 p-6'>
    <Skeleton className='h-[16px] w-[60%]' />
    <Skeleton className='h-[16px] w-[80%]' />
    <Skeleton className='h-[16px] w-[40%]' />
  </div>
)

interface ResourceContentProps {
  workspaceId: string
  resource: MothershipResource
  previewMode?: PreviewMode
  streamingFile?: {
    toolCallId?: string
    fileName: string
    fileId?: string
    targetKind?: 'new_file' | 'file_id'
    operation?: string
    edit?: Record<string, unknown>
    content: string
  } | null
  genericResourceData?: GenericResourceData
}

/**
 * Renders the content for the currently active mothership resource.
 * Handles table, file, and workflow resource types with appropriate
 * embedded rendering for each.
 */
const STREAMING_EPOCH = new Date(0)

export const ResourceContent = memo(function ResourceContent({
  workspaceId,
  resource,
  previewMode,
  streamingFile,
  genericResourceData,
}: ResourceContentProps) {
  const queryClient = useQueryClient()
  const streamFileName = streamingFile?.fileName || 'file.md'

  const streamOperation = useMemo(() => {
    if (!streamingFile) return undefined
    return streamingFile.operation
  }, [streamingFile])

  const isWriteStream = streamOperation === 'create' || streamOperation === 'append'
  const isPatchStream = streamOperation === 'patch'
  const isUpdateStream = streamOperation === 'update'

  const { data: allFiles = [] } = useWorkspaceFiles(workspaceId)
  const previewFileId =
    streamingFile?.fileId ?? (resource.type === 'file' ? resource.id : undefined)
  const previewFileRecord = useMemo(() => {
    if (!previewFileId) return undefined
    return allFiles.find((f) => f.id === previewFileId)
  }, [previewFileId, allFiles])

  const isSourceMime =
    previewFileRecord?.type === 'text/x-pptxgenjs' ||
    previewFileRecord?.type === 'text/x-docxjs' ||
    previewFileRecord?.type === 'text/x-pdflibjs'
  const previewContentMode = isSourceMime ? 'raw' : 'text'

  const { data: fetchedFileContent } = useWorkspaceFileContent(
    workspaceId,
    previewFileRecord?.id ?? '',
    previewFileRecord?.key ?? '',
    isSourceMime
  )

  const frozenPreviewBaseKey =
    streamingFile?.toolCallId &&
    previewFileRecord?.id &&
    streamingFile.targetKind === 'file_id' &&
    (streamOperation === 'append' || streamOperation === 'patch')
      ? `${streamingFile.toolCallId}:${streamOperation}:${previewFileRecord.id}`
      : null
  const cachedFrozenPreviewBase =
    frozenPreviewBaseKey && previewFileRecord?.id
      ? queryClient.getQueryData<string>(
          workspaceFilesKeys.content(workspaceId, previewFileRecord.id, previewContentMode)
        )
      : undefined
  const [frozenPreviewBaseState, setFrozenPreviewBaseState] = useState<{
    key: string | null
    content: string | null
  }>({ key: null, content: null })

  useEffect(() => {
    if (!frozenPreviewBaseKey || !previewFileRecord?.id) {
      setFrozenPreviewBaseState((prev) => (prev.key === null ? prev : { key: null, content: null }))
      return
    }

    setFrozenPreviewBaseState((prev) => {
      if (prev.key === frozenPreviewBaseKey) {
        return prev
      }
      return typeof cachedFrozenPreviewBase === 'string'
        ? { key: frozenPreviewBaseKey, content: cachedFrozenPreviewBase }
        : { key: frozenPreviewBaseKey, content: null }
    })
  }, [cachedFrozenPreviewBase, frozenPreviewBaseKey, previewFileRecord?.id])

  const frozenExistingFilePreviewBase =
    frozenPreviewBaseState.key === frozenPreviewBaseKey
      ? (frozenPreviewBaseState.content ?? undefined)
      : typeof cachedFrozenPreviewBase === 'string'
        ? cachedFrozenPreviewBase
        : undefined

  const streamingExtractedContent = useMemo(() => {
    if (!streamingFile) return undefined
    if (!streamOperation) return undefined

    if (isPatchStream) {
      if (streamingFile.targetKind === 'file_id') {
        if (frozenExistingFilePreviewBase === undefined) return undefined
        if (!shouldApplyPatchPreview(streamingFile)) return undefined
        return extractPatchPreview(streamingFile, frozenExistingFilePreviewBase)
      }
      if (fetchedFileContent === undefined) return undefined
      if (!shouldApplyPatchPreview(streamingFile)) return undefined
      return extractPatchPreview(streamingFile, fetchedFileContent)
    }

    const extracted = streamingFile.content

    if (isUpdateStream) return extracted

    if (streamOperation === 'append') {
      if (streamingFile.targetKind === 'file_id') {
        if (frozenExistingFilePreviewBase === undefined) return undefined
        return buildAppendPreview(frozenExistingFilePreviewBase, extracted)
      }
      return extracted.length > 0 ? extracted : undefined
    }

    if (streamOperation === 'create') {
      return extracted.length > 0 ? extracted : undefined
    }

    if (isWriteStream) return extracted.length > 0 ? extracted : undefined

    return undefined
  }, [
    streamingFile,
    streamOperation,
    isWriteStream,
    isPatchStream,
    isUpdateStream,
    fetchedFileContent,
    frozenExistingFilePreviewBase,
  ])
  const syntheticFile = useMemo(() => {
    const ext = getFileExtension(streamFileName)
    const SOURCE_MIME_MAP: Record<string, string> = {
      pptx: 'text/x-pptxgenjs',
      docx: 'text/x-docxjs',
      pdf: 'text/x-pdflibjs',
    }
    const type = SOURCE_MIME_MAP[ext] ?? getMimeTypeFromExtension(ext)
    return {
      id: 'streaming-file',
      workspaceId,
      name: streamFileName,
      key: '',
      path: '',
      size: 0,
      type,
      uploadedBy: '',
      uploadedAt: STREAMING_EPOCH,
    }
  }, [workspaceId, streamFileName])

  // ResourceContent now reconstructs full-file preview text per operation,
  // so the viewer can always treat streaming content as a whole-file replace.
  const streamingFileMode: 'append' | 'replace' = 'replace'

  const embeddedStreamingContent = streamingExtractedContent

  if (streamingFile && resource.id === 'streaming-file') {
    return (
      <div className='flex h-full flex-col overflow-hidden'>
        {streamingExtractedContent !== undefined ? (
          <FileViewer
            file={syntheticFile}
            workspaceId={workspaceId}
            canEdit={false}
            previewMode={previewMode ?? 'preview'}
            streamingContent={streamingExtractedContent}
            streamingMode={streamingFileMode}
            useCodeRendererForCodeFiles
          />
        ) : (
          <div className='flex h-full items-center justify-center'>
            <p className='text-[13px] text-[var(--text-muted)]'>Processing file...</p>
          </div>
        )}
      </div>
    )
  }

  switch (resource.type) {
    case 'table':
      return <Table key={resource.id} workspaceId={workspaceId} tableId={resource.id} embedded />

    case 'file':
      return (
        <EmbeddedFile
          key={resource.id}
          workspaceId={workspaceId}
          fileId={resource.id}
          previewMode={previewMode}
          streamingContent={embeddedStreamingContent}
          streamingMode={streamingFileMode}
        />
      )

    case 'workflow':
      return (
        <EmbeddedWorkflow key={resource.id} workspaceId={workspaceId} workflowId={resource.id} />
      )

    case 'knowledgebase':
      return (
        <KnowledgeBase
          key={resource.id}
          id={resource.id}
          knowledgeBaseName={resource.title}
          workspaceId={workspaceId}
        />
      )

    case 'folder':
      return <EmbeddedFolder key={resource.id} workspaceId={workspaceId} folderId={resource.id} />

    case 'generic':
      return (
        <GenericResourceContent key={resource.id} data={genericResourceData ?? { entries: [] }} />
      )

    default:
      return null
  }
})

interface ResourceActionsProps {
  workspaceId: string
  resource: MothershipResource
}

export function ResourceActions({ workspaceId, resource }: ResourceActionsProps) {
  switch (resource.type) {
    case 'workflow':
      return <EmbeddedWorkflowActions workspaceId={workspaceId} workflowId={resource.id} />
    case 'file':
      return <EmbeddedFileActions workspaceId={workspaceId} fileId={resource.id} />
    case 'knowledgebase':
      return (
        <EmbeddedKnowledgeBaseActions workspaceId={workspaceId} knowledgeBaseId={resource.id} />
      )
    case 'folder':
    case 'generic':
      return null
    default:
      return null
  }
}

interface EmbeddedWorkflowActionsProps {
  workspaceId: string
  workflowId: string
}

export function EmbeddedWorkflowActions({ workspaceId, workflowId }: EmbeddedWorkflowActionsProps) {
  const router = useRouter()
  const { navigateToSettings } = useSettingsNavigation()
  const { userPermissions: effectivePermissions } = useWorkspacePermissionsContext()
  const setActiveWorkflow = useWorkflowRegistry((state) => state.setActiveWorkflow)
  const { handleRunWorkflow, handleCancelExecution } = useWorkflowExecution()
  const isExecuting = useExecutionStore(
    (state) => state.workflowExecutions.get(workflowId)?.isExecuting ?? false
  )
  const { usageExceeded } = useUsageLimits()

  useEffect(() => {
    setActiveWorkflow(workflowId)
  }, [setActiveWorkflow, workflowId])

  const isRunButtonDisabled =
    !isExecuting && !effectivePermissions.canRead && !effectivePermissions.isLoading

  const handleRun = useCallback(async () => {
    setActiveWorkflow(workflowId)

    if (isExecuting) {
      const toolCallId = markRunToolManuallyStopped(workflowId)
      cancelRunToolExecution(workflowId)
      await handleCancelExecution()
      await reportManualRunToolStop(workflowId, toolCallId)
      return
    }

    if (usageExceeded) {
      navigateToSettings({ section: 'subscription' })
      return
    }

    await handleRunWorkflow()
  }, [
    handleCancelExecution,
    handleRunWorkflow,
    isExecuting,
    navigateToSettings,
    setActiveWorkflow,
    usageExceeded,
    workflowId,
  ])

  const handleOpenWorkflow = useCallback(() => {
    window.open(`/workspace/${workspaceId}/w/${workflowId}`, '_blank')
  }, [workspaceId, workflowId])

  return (
    <>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Button
            variant='subtle'
            onClick={handleOpenWorkflow}
            className={RESOURCE_TAB_ICON_BUTTON_CLASS}
            aria-label='Open workflow'
          >
            <SquareArrowUpRight className={RESOURCE_TAB_ICON_CLASS} />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content side='bottom'>
          <p>Open workflow</p>
        </Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Button
            variant='subtle'
            onClick={() => void handleRun()}
            disabled={isRunButtonDisabled}
            className={RESOURCE_TAB_ICON_BUTTON_CLASS}
            aria-label={isExecuting ? 'Stop workflow' : 'Run workflow'}
          >
            {isExecuting ? (
              <Square className={RESOURCE_TAB_ICON_CLASS} />
            ) : (
              <PlayOutline className={RESOURCE_TAB_ICON_CLASS} />
            )}
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content side='bottom'>
          <p>{isExecuting ? 'Stop' : 'Run workflow'}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    </>
  )
}

interface EmbeddedKnowledgeBaseActionsProps {
  workspaceId: string
  knowledgeBaseId: string
}

export function EmbeddedKnowledgeBaseActions({
  workspaceId,
  knowledgeBaseId,
}: EmbeddedKnowledgeBaseActionsProps) {
  const router = useRouter()

  const handleOpenKnowledgeBase = useCallback(() => {
    router.push(`/workspace/${workspaceId}/knowledge/${knowledgeBaseId}`)
  }, [router, workspaceId, knowledgeBaseId])

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Button
          variant='subtle'
          onClick={handleOpenKnowledgeBase}
          className={RESOURCE_TAB_ICON_BUTTON_CLASS}
          aria-label='Open knowledge base'
        >
          <SquareArrowUpRight className={RESOURCE_TAB_ICON_CLASS} />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content side='bottom'>
        <p>Open knowledge base</p>
      </Tooltip.Content>
    </Tooltip.Root>
  )
}

const fileLogger = createLogger('EmbeddedFileActions')

interface EmbeddedFileActionsProps {
  workspaceId: string
  fileId: string
}

function EmbeddedFileActions({ workspaceId, fileId }: EmbeddedFileActionsProps) {
  const router = useRouter()
  const { data: files = [] } = useWorkspaceFiles(workspaceId)
  const file = useMemo(() => files.find((f) => f.id === fileId), [files, fileId])

  const handleDownload = useCallback(async () => {
    if (!file) return
    try {
      await downloadWorkspaceFile(file)
    } catch (err) {
      fileLogger.error('Failed to download file:', err)
    }
  }, [file])

  const handleOpenInFiles = useCallback(() => {
    router.push(`/workspace/${workspaceId}/files/${encodeURIComponent(fileId)}`)
  }, [router, workspaceId, fileId])

  return (
    <>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Button
            variant='subtle'
            onClick={handleOpenInFiles}
            className={RESOURCE_TAB_ICON_BUTTON_CLASS}
            aria-label='Open in files'
          >
            <SquareArrowUpRight className={RESOURCE_TAB_ICON_CLASS} />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content side='bottom'>
          <p>Open in files</p>
        </Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Button
            variant='subtle'
            onClick={() => void handleDownload()}
            disabled={!file}
            className={RESOURCE_TAB_ICON_BUTTON_CLASS}
            aria-label='Download file'
          >
            <Download className={RESOURCE_TAB_ICON_CLASS} />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content side='bottom'>
          <p>Download</p>
        </Tooltip.Content>
      </Tooltip.Root>
    </>
  )
}

interface EmbeddedWorkflowProps {
  workspaceId: string
  workflowId: string
}

function EmbeddedWorkflow({ workspaceId, workflowId }: EmbeddedWorkflowProps) {
  const { data: workflowList, isPending: isWorkflowsPending } = useWorkflows(workspaceId)
  const workflowExists = useMemo(
    () => (workflowList ?? []).some((w) => w.id === workflowId),
    [workflowList, workflowId]
  )
  const hasLoadError = useWorkflowRegistry(
    (state) => state.hydration.phase === 'error' && state.hydration.workflowId === workflowId
  )

  if (isWorkflowsPending) return LOADING_SKELETON

  if (!workflowExists || hasLoadError) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3'>
        <WorkflowX className='h-[32px] w-[32px] text-[var(--text-icon)]' />
        <div className='flex flex-col items-center gap-1'>
          <h2 className='font-medium text-[20px] text-[var(--text-primary)]'>Workflow not found</h2>
          <p className='text-[var(--text-body)] text-small'>
            This workflow may have been deleted or moved
          </p>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={LOADING_SKELETON}>
      <Workflow workspaceId={workspaceId} workflowId={workflowId} embedded />
    </Suspense>
  )
}

interface EmbeddedFileProps {
  workspaceId: string
  fileId: string
  previewMode?: PreviewMode
  streamingContent?: string
  streamingMode?: 'append' | 'replace'
}

function EmbeddedFile({
  workspaceId,
  fileId,
  previewMode,
  streamingContent,
  streamingMode,
}: EmbeddedFileProps) {
  const { canEdit } = useUserPermissionsContext()
  const { data: files = [], isLoading, isFetching } = useWorkspaceFiles(workspaceId)
  const file = useMemo(() => files.find((f) => f.id === fileId), [files, fileId])

  if (isLoading || (isFetching && !file)) return LOADING_SKELETON

  if (!file) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3'>
        <FileX className='h-[32px] w-[32px] text-[var(--text-icon)]' />
        <div className='flex flex-col items-center gap-1'>
          <h2 className='font-medium text-[20px] text-[var(--text-primary)]'>File not found</h2>
          <p className='text-[var(--text-body)] text-small'>
            This file may have been deleted or moved
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      <FileViewer
        key={file.id}
        file={file}
        workspaceId={workspaceId}
        canEdit={canEdit}
        streamingMode={streamingMode}
        previewMode={previewMode}
        streamingContent={streamingContent}
        useCodeRendererForCodeFiles
      />
    </div>
  )
}

interface EmbeddedFolderProps {
  workspaceId: string
  folderId: string
}

function EmbeddedFolder({ workspaceId, folderId }: EmbeddedFolderProps) {
  const { data: folderList, isPending: isFoldersPending } = useFolders(workspaceId)
  const { data: workflowList = [] } = useWorkflows(workspaceId)

  const folder = useMemo(
    () => (folderList ?? []).find((f) => f.id === folderId),
    [folderList, folderId]
  )

  const folderWorkflows = useMemo(
    () => workflowList.filter((w) => w.folderId === folderId),
    [workflowList, folderId]
  )

  if (isFoldersPending) return LOADING_SKELETON

  if (!folder) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3'>
        <FolderIcon className='h-[32px] w-[32px] text-[var(--text-icon)]' />
        <div className='flex flex-col items-center gap-1'>
          <h2 className='font-medium text-[20px] text-[var(--text-primary)]'>Folder not found</h2>
          <p className='text-[var(--text-body)] text-small'>
            This folder may have been deleted or moved
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-full flex-col overflow-y-auto p-6'>
      <h2 className='mb-4 font-medium text-[16px] text-[var(--text-primary)]'>{folder.name}</h2>
      {folderWorkflows.length === 0 ? (
        <p className='text-[13px] text-[var(--text-muted)]'>No workflows in this folder</p>
      ) : (
        <div className='flex flex-col gap-1'>
          {folderWorkflows.map((w) => (
            <button
              key={w.id}
              type='button'
              onClick={() => window.open(`/workspace/${workspaceId}/w/${w.id}`, '_blank')}
              className='flex items-center gap-2 rounded-[6px] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-4)]'
            >
              <div
                className='h-[12px] w-[12px] flex-shrink-0 rounded-[3px] border-[2px]'
                style={{
                  backgroundColor: w.color,
                  borderColor: workflowBorderColor(w.color),
                  backgroundClip: 'padding-box',
                }}
              />
              <span className='truncate text-[13px] text-[var(--text-primary)]'>{w.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function findAnchorIndex(lines: string[], anchor: string, occurrence = 1, afterIndex = -1): number {
  const trimmed = anchor.trim()
  let count = 0
  for (let i = afterIndex + 1; i < lines.length; i++) {
    if (lines[i].trim() === trimmed) {
      count++
      if (count === occurrence) return i
    }
  }
  return -1
}

function extractPatchPreview(
  streamingFile: {
    content: string
    edit?: Record<string, unknown>
  },
  existingContent: string
): string | undefined {
  const edit = streamingFile.edit ?? {}
  const strategy = typeof edit.strategy === 'string' ? edit.strategy : undefined
  const lines = existingContent.split('\n')
  const occurrence =
    typeof edit.occurrence === 'number' && Number.isFinite(edit.occurrence) ? edit.occurrence : 1

  if (strategy === 'search_replace') {
    const search = typeof edit.search === 'string' ? edit.search : ''
    if (!search) return undefined
    const replace = streamingFile.content
    if ((edit.replaceAll as boolean | undefined) === true) {
      return existingContent.split(search).join(replace)
    }
    const firstIdx = existingContent.indexOf(search)
    if (firstIdx === -1) return undefined
    return (
      existingContent.slice(0, firstIdx) + replace + existingContent.slice(firstIdx + search.length)
    )
  }

  const mode = typeof edit.mode === 'string' ? edit.mode : undefined
  if (!mode) return undefined

  if (mode === 'replace_between') {
    const beforeAnchor = typeof edit.before_anchor === 'string' ? edit.before_anchor : undefined
    const afterAnchor = typeof edit.after_anchor === 'string' ? edit.after_anchor : undefined
    if (!beforeAnchor || !afterAnchor) return undefined

    const beforeIdx = findAnchorIndex(lines, beforeAnchor, occurrence)
    const afterIdx = findAnchorIndex(lines, afterAnchor, occurrence, beforeIdx)
    if (beforeIdx === -1 || afterIdx === -1 || afterIdx <= beforeIdx) return undefined

    const newContent = streamingFile.content
    const spliced = [
      ...lines.slice(0, beforeIdx + 1),
      ...(newContent.length > 0 ? newContent.split('\n') : []),
      ...lines.slice(afterIdx),
    ]
    return spliced.join('\n')
  }

  if (mode === 'insert_after') {
    const anchor = typeof edit.anchor === 'string' ? edit.anchor : undefined
    if (!anchor) return undefined

    const anchorIdx = findAnchorIndex(lines, anchor, occurrence)
    if (anchorIdx === -1) return undefined

    const newContent = streamingFile.content
    const spliced = [
      ...lines.slice(0, anchorIdx + 1),
      ...(newContent.length > 0 ? newContent.split('\n') : []),
      ...lines.slice(anchorIdx + 1),
    ]
    return spliced.join('\n')
  }

  if (mode === 'delete_between') {
    const startAnchor = typeof edit.start_anchor === 'string' ? edit.start_anchor : undefined
    const endAnchor = typeof edit.end_anchor === 'string' ? edit.end_anchor : undefined
    if (!startAnchor || !endAnchor) return undefined

    const startIdx = findAnchorIndex(lines, startAnchor, occurrence)
    const endIdx = findAnchorIndex(lines, endAnchor, occurrence, startIdx)
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return undefined

    const spliced = [...lines.slice(0, startIdx), ...lines.slice(endIdx)]
    return spliced.join('\n')
  }

  return undefined
}

function shouldApplyPatchPreview(streamingFile: {
  content: string
  edit?: Record<string, unknown>
}): boolean {
  const edit = streamingFile.edit ?? {}
  const strategy = typeof edit.strategy === 'string' ? edit.strategy : undefined
  const mode = typeof edit.mode === 'string' ? edit.mode : undefined

  // delete_between is delete-only and can be previewed from intent metadata alone.
  if (strategy === 'anchored' && mode === 'delete_between') {
    return true
  }

  // For all other patch modes, keep the visible file unchanged until
  // edit_content actually streams content into the target location.
  return streamingFile.content.length > 0
}

function buildAppendPreview(existingContent: string, incomingContent: string): string {
  if (incomingContent.length === 0) return existingContent
  if (existingContent.length === 0) return incomingContent
  return `${existingContent}\n${incomingContent}`
}

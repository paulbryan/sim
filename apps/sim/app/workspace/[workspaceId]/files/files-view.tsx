'use client'

import { Files as FilesIcon } from 'lucide-react'
import { Files } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/settings-modal/components/files/files'

export function FilesView() {
  return (
    <div className='flex h-full flex-col'>
      <div className='flex items-center gap-3 border-[var(--border)] border-b px-6 py-4'>
        <div className='flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface-3)]'>
          <FilesIcon className='h-4 w-4 text-[var(--text-secondary)]' />
        </div>
        <div>
          <h1 className='font-medium text-[var(--text-primary)] text-base'>Files</h1>
          <p className='text-[var(--text-muted)] text-xs'>
            Workspace files accessible across all workflows
          </p>
        </div>
      </div>
      <div className='flex-1 overflow-hidden px-6 py-4'>
        <Files />
      </div>
    </div>
  )
}

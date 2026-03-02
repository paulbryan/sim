'use client'

import { useEffect } from 'react'
import { createLogger } from '@sim/logger'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/emcn'

const logger = createLogger('WorkspaceError')

interface WorkspaceErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function WorkspaceError({ error, reset }: WorkspaceErrorProps) {
  useEffect(() => {
    logger.error('Workspace error:', { error: error.message, digest: error.digest })
  }, [error])

  return (
    <div className='flex h-full flex-1 items-center justify-center bg-white dark:bg-[var(--bg)]'>
      <div className='flex flex-col items-center gap-[16px] text-center'>
        <div className='flex h-[48px] w-[48px] items-center justify-center rounded-full bg-[var(--surface-4)]'>
          <AlertTriangle className='h-[24px] w-[24px] text-[var(--text-error)]' />
        </div>
        <div className='flex flex-col gap-[8px]'>
          <h2 className='font-semibold text-[16px] text-[var(--text-primary)]'>
            Something went wrong
          </h2>
          <p className='max-w-[300px] text-[13px] text-[var(--text-tertiary)]'>
            An unexpected error occurred. Please try again or refresh the page.
          </p>
        </div>
        <Button variant='default' size='sm' onClick={reset}>
          <RefreshCw className='mr-[6px] h-[14px] w-[14px]' />
          Try again
        </Button>
      </div>
    </div>
  )
}

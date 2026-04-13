import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/internal'
import { getJobQueue } from '@/lib/core/async-jobs'

export const dynamic = 'force-dynamic'

const logger = createLogger('SoftDeleteCleanupAPI')

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request, 'soft-delete cleanup')
    if (authError) return authError

    const jobQueue = await getJobQueue()
    const jobId = await jobQueue.enqueue('cleanup-soft-deletes', {})

    logger.info('Soft-delete cleanup job dispatched', { jobId })

    return NextResponse.json({ triggered: true, jobId })
  } catch (error) {
    logger.error('Failed to dispatch soft-delete cleanup job:', { error })
    return NextResponse.json({ error: 'Failed to dispatch soft-delete cleanup' }, { status: 500 })
  }
}

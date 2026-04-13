import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/internal'
import { getJobQueue } from '@/lib/core/async-jobs'

export const dynamic = 'force-dynamic'

const logger = createLogger('TaskRedactionAPI')

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request, 'task context redaction')
    if (authError) return authError

    const jobQueue = await getJobQueue()
    const jobId = await jobQueue.enqueue('redact-task-context', {})

    logger.info('Task context redaction job dispatched', { jobId })

    return NextResponse.json({ triggered: true, jobId })
  } catch (error) {
    logger.error('Failed to dispatch task context redaction job:', { error })
    return NextResponse.json(
      { error: 'Failed to dispatch task context redaction' },
      { status: 500 }
    )
  }
}

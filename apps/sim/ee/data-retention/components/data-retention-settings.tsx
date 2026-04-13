'use client'

import { useCallback, useState } from 'react'
import { createLogger } from '@sim/logger'
import { Loader2 } from 'lucide-react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/emcn'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/core/utils/cn'
import {
  type DataRetentionResponse,
  useUpdateWorkspaceRetention,
  useWorkspaceRetention,
} from '@/ee/data-retention/hooks/data-retention'

const logger = createLogger('DataRetentionSettings')

const DAY_OPTIONS = [
  { value: '1', label: '1 day' },
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '1 year' },
  { value: '1825', label: '5 years' },
  { value: 'never', label: 'Forever' },
] as const

interface RetentionFieldProps {
  label: string
  description: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}

function RetentionField({ label, description, value, onChange, disabled }: RetentionFieldProps) {
  return (
    <div className='flex items-center justify-between py-2'>
      <div className='flex flex-col gap-0.5'>
        <span className='text-[13px] text-[var(--text-primary)]'>{label}</span>
        <p className='text-[12px] text-[var(--text-muted)]'>{description}</p>
      </div>
      {disabled ? (
        <span className='text-[13px] text-[var(--text-muted)]'>
          {DAY_OPTIONS.find((o) => o.value === value)?.label ?? `${value} days`}
        </span>
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className='w-[140px] text-[13px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className='text-[13px]'>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function hoursToDisplayDays(hours: number | null): string {
  if (hours === null) return 'never'
  return String(Math.round(hours / 24))
}

function daysToHours(days: string): number | null {
  if (days === 'never') return null
  return Number(days) * 24
}

function planLabel(plan: string): string {
  switch (plan) {
    case 'enterprise':
      return 'Enterprise'
    case 'pro':
      return 'Pro'
    default:
      return 'Free'
  }
}

function LockedView({ data }: { data: DataRetentionResponse }) {
  return (
    <div className='flex flex-col gap-5'>
      <p className='text-[13px] text-[var(--text-muted)]'>
        Data retention policies control how long your workspace data is kept before automatic
        cleanup. Custom retention periods are available on Enterprise plans.
      </p>
      <div className='flex flex-col'>
        <RetentionField
          label='Log Retention'
          description='How long execution logs are kept before archival.'
          value={hoursToDisplayDays(data.effective.logRetentionHours)}
          onChange={() => {}}
          disabled
        />
        <RetentionField
          label='Soft Deletion Cleanup'
          description='How long deleted resources are recoverable before permanent removal.'
          value={hoursToDisplayDays(data.effective.softDeleteRetentionHours)}
          onChange={() => {}}
          disabled
        />
        <RetentionField
          label='Task Context Redaction'
          description='How long before sensitive data in task contexts is redacted.'
          value={hoursToDisplayDays(data.effective.taskRedactionHours)}
          onChange={() => {}}
          disabled
        />
        <RetentionField
          label='Task Cleanup'
          description='How long before old tasks are permanently deleted.'
          value={hoursToDisplayDays(data.effective.taskCleanupHours)}
          onChange={() => {}}
          disabled
        />
      </div>
      <p className='text-[12px] text-[var(--text-muted)]'>
        {planLabel(data.plan)} plan defaults. Upgrade to Enterprise to customize retention periods.
      </p>
    </div>
  )
}

function EditableView({ data, workspaceId }: { data: DataRetentionResponse; workspaceId: string }) {
  const updateMutation = useUpdateWorkspaceRetention()

  const [logDays, setLogDays] = useState(hoursToDisplayDays(data.effective.logRetentionHours))
  const [softDeleteDays, setSoftDeleteDays] = useState(
    hoursToDisplayDays(data.effective.softDeleteRetentionHours)
  )
  const [taskRedactionDays, setTaskRedactionDays] = useState(
    hoursToDisplayDays(data.effective.taskRedactionHours)
  )
  const [taskCleanupDays, setTaskCleanupDays] = useState(
    hoursToDisplayDays(data.effective.taskCleanupHours)
  )

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleSave = useCallback(async () => {
    setSaveError(null)
    setSaveSuccess(false)

    try {
      await updateMutation.mutateAsync({
        workspaceId,
        settings: {
          logRetentionHours: daysToHours(logDays),
          softDeleteRetentionHours: daysToHours(softDeleteDays),
          taskRedactionHours: daysToHours(taskRedactionDays),
          taskCleanupHours: daysToHours(taskCleanupDays),
        },
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      logger.error('Failed to save data retention settings', { error })
      setSaveError(error instanceof Error ? error.message : 'Failed to save settings')
    }
  }, [workspaceId, logDays, softDeleteDays, taskRedactionDays, taskCleanupDays])

  return (
    <div className='flex flex-col gap-5'>
      <p className='text-[13px] text-[var(--text-muted)]'>
        Configure how long your workspace data is retained before automatic cleanup. Values apply to
        all workflows in this workspace.
      </p>
      <div className='flex flex-col'>
        <RetentionField
          label='Log Retention'
          description='How long execution logs are kept before archival.'
          value={logDays}
          onChange={setLogDays}
          disabled={false}
        />
        <RetentionField
          label='Soft Deletion Cleanup'
          description='How long deleted resources are recoverable before permanent removal.'
          value={softDeleteDays}
          onChange={setSoftDeleteDays}
          disabled={false}
        />
        <RetentionField
          label='Task Context Redaction'
          description='How long before sensitive data in task contexts is redacted.'
          value={taskRedactionDays}
          onChange={setTaskRedactionDays}
          disabled={false}
        />
        <RetentionField
          label='Task Cleanup'
          description='How long before old tasks are permanently deleted.'
          value={taskCleanupDays}
          onChange={setTaskCleanupDays}
          disabled={false}
        />
      </div>

      <div className='flex items-center gap-3'>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className='text-[13px]'
        >
          {updateMutation.isPending ? (
            <>
              <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </Button>
        {saveSuccess && (
          <span className='text-[13px] text-green-500'>Settings saved successfully.</span>
        )}
        {saveError && <span className='text-[13px] text-red-500'>{saveError}</span>}
      </div>
    </div>
  )
}

export function DataRetentionSettings() {
  const params = useParams()
  const workspaceId = params.workspaceId as string

  const { data, isLoading, error } = useWorkspaceRetention(workspaceId)

  if (isLoading) {
    return (
      <div className='flex flex-col gap-4'>
        {[...Array(3)].map((_, i) => (
          <div key={i} className='h-[40px] w-full animate-pulse rounded bg-[var(--surface-3)]' />
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className='text-[13px] text-[var(--text-muted)]'>
        Failed to load data retention settings.
      </div>
    )
  }

  if (!data.isEnterprise) {
    return <LockedView data={data} />
  }

  return <EditableView data={data} workspaceId={workspaceId} />
}

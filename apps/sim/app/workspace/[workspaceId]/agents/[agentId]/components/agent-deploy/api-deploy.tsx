'use client'

import { useState } from 'react'
import { createLogger } from '@sim/logger'
import { Button, Label } from '@/components/emcn'
import { Check, Copy } from '@/components/emcn/icons'
import { useUpdateAgent } from '@/hooks/queries/agents'

const logger = createLogger('ApiDeploy')

interface ApiDeployProps {
  agentId: string
  workspaceId: string
  isDeployed: boolean
}

export function ApiDeploy({ agentId, workspaceId, isDeployed }: ApiDeployProps) {
  const { mutateAsync: updateAgent, isPending } = useUpdateAgent()
  const [copied, setCopied] = useState(false)

  const endpoint =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/agents/${agentId}`
      : `/api/v1/agents/${agentId}`

  const curlExample = `curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer <your-api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello, agent!"}'`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(curlExample)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const handleToggle = async () => {
    try {
      await updateAgent({ agentId, isDeployed: !isDeployed })
    } catch (error) {
      logger.error('Failed to toggle API deployment', { error })
    }
  }

  return (
    <div className='space-y-[16px]'>
      <p className='text-[13px] text-[var(--text-muted)]'>
        Call your agent via REST API using your workspace API key.
      </p>

      <div className='flex items-center justify-between'>
        <Label className='text-[13px]'>API access</Label>
        <Button variant='subtle' size='sm' onClick={handleToggle} disabled={isPending}>
          {isDeployed ? 'Disable' : 'Enable'}
        </Button>
      </div>

      {isDeployed && (
        <>
          <div>
            <Label className='mb-[6px] block text-[12px] text-[var(--text-muted)]'>Endpoint</Label>
            <div className='flex items-center gap-[8px] rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-4)] px-[10px] py-[7px]'>
              <code className='flex-1 truncate text-[12px] text-[var(--text-primary)]'>
                {endpoint}
              </code>
            </div>
          </div>

          <div>
            <div className='mb-[6px] flex items-center justify-between'>
              <Label className='text-[12px] text-[var(--text-muted)]'>Example request</Label>
              <button
                type='button'
                onClick={handleCopy}
                className='flex items-center gap-[4px] text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              >
                {copied ? (
                  <>
                    <Check className='h-[11px] w-[11px]' />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className='h-[11px] w-[11px]' />
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre className='overflow-x-auto rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-4)] px-[10px] py-[8px] text-[11px] text-[var(--text-primary)] leading-[1.6]'>
              {curlExample}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}

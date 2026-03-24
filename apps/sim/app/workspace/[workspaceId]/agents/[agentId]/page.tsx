import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyWorkspaceMembership } from '@/app/api/workflows/utils'
import { AgentDetail } from '@/app/workspace/[workspaceId]/agents/[agentId]/agent-detail'
import { getUserPermissionConfig } from '@/ee/access-control/utils/permission-check'

export const metadata: Metadata = {
  title: 'Agent',
}

interface AgentDetailPageProps {
  params: Promise<{
    workspaceId: string
    agentId: string
  }>
}

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { workspaceId, agentId } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/')
  }

  const hasPermission = await verifyWorkspaceMembership(session.user.id, workspaceId)
  if (!hasPermission) {
    redirect('/')
  }

  const permissionConfig = await getUserPermissionConfig(session.user.id)
  if (permissionConfig?.hideAgentsTab) {
    redirect(`/workspace/${workspaceId}`)
  }

  return <AgentDetail agentId={agentId} workspaceId={workspaceId} />
}

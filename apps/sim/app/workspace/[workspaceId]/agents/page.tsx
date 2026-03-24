import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyWorkspaceMembership } from '@/app/api/workflows/utils'
import { Agents } from '@/app/workspace/[workspaceId]/agents/agents'
import { getUserPermissionConfig } from '@/ee/access-control/utils/permission-check'

export const metadata: Metadata = {
  title: 'Agents',
}

interface AgentsPageProps {
  params: Promise<{
    workspaceId: string
  }>
}

export default async function AgentsPage({ params }: AgentsPageProps) {
  const { workspaceId } = await params
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

  return <Agents />
}

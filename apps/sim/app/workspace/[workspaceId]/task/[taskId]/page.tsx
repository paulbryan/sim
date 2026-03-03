import { Home } from '@/app/workspace/[workspaceId]/home/home'

interface TaskPageProps {
  params: Promise<{
    workspaceId: string
    taskId: string
  }>
}

export default async function TaskPage({ params }: TaskPageProps) {
  const { taskId } = await params
  return <Home key={taskId} chatId={taskId} />
}

'use client'

import {
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalTabs,
  ModalTabsContent,
  ModalTabsList,
  ModalTabsTrigger,
} from '@/components/emcn'
import { ApiDeploy } from '@/app/workspace/[workspaceId]/agents/[agentId]/components/agent-deploy/api-deploy'
import { SlackDeploy } from '@/app/workspace/[workspaceId]/agents/[agentId]/components/agent-deploy/slack-deploy'

interface DeployModalProps {
  agentId: string
  workspaceId: string
  isDeployed: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeployModal({
  agentId,
  workspaceId,
  isDeployed,
  open,
  onOpenChange,
}: DeployModalProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size='md'>
        <ModalHeader>Deploy agent</ModalHeader>
        <ModalTabs defaultValue='slack'>
          <ModalTabsList>
            <ModalTabsTrigger value='slack'>Slack</ModalTabsTrigger>
            <ModalTabsTrigger value='api'>API</ModalTabsTrigger>
          </ModalTabsList>
          <ModalBody>
            <ModalTabsContent value='slack'>
              <SlackDeploy agentId={agentId} workspaceId={workspaceId} />
            </ModalTabsContent>
            <ModalTabsContent value='api'>
              <ApiDeploy agentId={agentId} workspaceId={workspaceId} isDeployed={isDeployed} />
            </ModalTabsContent>
          </ModalBody>
        </ModalTabs>
      </ModalContent>
    </Modal>
  )
}

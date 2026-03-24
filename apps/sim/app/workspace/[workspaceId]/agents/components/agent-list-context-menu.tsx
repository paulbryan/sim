'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/emcn'
import { Plus } from '@/components/emcn/icons'

interface AgentListContextMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  onClose: () => void
  onAddAgent?: () => void
  disableAdd?: boolean
}

export function AgentListContextMenu({
  isOpen,
  position,
  onClose,
  onAddAgent,
  disableAdd = false,
}: AgentListContextMenuProps) {
  return (
    <DropdownMenu open={isOpen} onOpenChange={(open) => !open && onClose()} modal={false}>
      <DropdownMenuTrigger asChild>
        <div
          style={{
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: '1px',
            height: '1px',
            pointerEvents: 'none',
          }}
          tabIndex={-1}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        side='bottom'
        sideOffset={4}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {onAddAgent && (
          <DropdownMenuItem disabled={disableAdd} onSelect={onAddAgent}>
            <Plus />
            New agent
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

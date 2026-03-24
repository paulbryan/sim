'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/emcn'
import { Loader, Pencil, SquareArrowUpRight, Trash } from '@/components/emcn/icons'

interface AgentContextMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  onClose: () => void
  onOpen?: () => void
  onRename?: () => void
  onDelete?: () => void
  isDeleting?: boolean
  disableEdit?: boolean
}

export function AgentContextMenu({
  isOpen,
  position,
  onClose,
  onOpen,
  onRename,
  onDelete,
  isDeleting = false,
  disableEdit = false,
}: AgentContextMenuProps) {
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
        {onOpen && (
          <DropdownMenuItem onSelect={onOpen}>
            <SquareArrowUpRight />
            Open
          </DropdownMenuItem>
        )}
        {onRename && (
          <DropdownMenuItem disabled={disableEdit} onSelect={onRename}>
            <Pencil />
            Rename
          </DropdownMenuItem>
        )}
        {onDelete && (onOpen || onRename) && <DropdownMenuSeparator />}
        {onDelete && (
          <DropdownMenuItem disabled={disableEdit || isDeleting} onSelect={onDelete}>
            {isDeleting ? <Loader className='animate-spin' /> : <Trash />}
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

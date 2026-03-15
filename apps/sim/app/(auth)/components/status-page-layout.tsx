'use client'

import type { ReactNode } from 'react'
import { SupportFooter } from './support-footer'

export interface StatusPageLayoutProps {
  title: string
  description: string | ReactNode
  children?: ReactNode
  showSupportFooter?: boolean
}

export function StatusPageLayout({
  title,
  description,
  children,
  showSupportFooter = true,
}: StatusPageLayoutProps) {
  return (
    <>
      <div className='flex flex-col items-center justify-center'>
        <div className='space-y-1 text-center'>
          <h1 className='font-[500] text-[#ECECEC] text-[32px] tracking-tight'>{title}</h1>
          <p className='font-[380] text-[#999] text-[16px]'>{description}</p>
        </div>
        {children && <div className='mt-8 w-full max-w-[410px] space-y-3'>{children}</div>}
      </div>
      {showSupportFooter && <SupportFooter position='absolute' />}
    </>
  )
}

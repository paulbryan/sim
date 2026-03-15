'use client'

import Link from 'next/link'
import AuthBackground from '@/app/(auth)/components/auth-background'
import Navbar from '@/app/(home)/components/navbar/navbar'

export default function NotFound() {
  return (
    <AuthBackground className='font-[430] font-season'>
      <main className='relative flex min-h-full flex-col text-[#ECECEC]'>
        <header className='shrink-0 bg-[#1C1C1C]'>
          <Navbar />
        </header>
        <div className='relative z-30 flex flex-1 flex-col items-center justify-center px-4 pb-24'>
          <h1 className='font-[500] text-[48px] tracking-tight'>Page Not Found</h1>
          <p className='mt-2 text-[#999] text-[16px]'>
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <Link
            href='/'
            className='mt-8 inline-flex h-[30px] items-center rounded-[5px] border border-[#FFFFFF] bg-[#FFFFFF] px-[9px] text-[13.5px] text-black transition-colors hover:border-[#E0E0E0] hover:bg-[#E0E0E0]'
          >
            Return to Home
          </Link>
        </div>
      </main>
    </AuthBackground>
  )
}

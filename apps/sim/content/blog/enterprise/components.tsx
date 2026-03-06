interface ContactButtonProps {
  href: string
  children: React.ReactNode
}

export function ContactButton({ href, children }: ContactButtonProps) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='!text-black !no-underline inline-flex h-[32px] items-center gap-[8px] rounded-[5px] border border-[#33C482] bg-[#33C482] px-[10px] font-[430] font-season text-[14px] transition-[filter] hover:brightness-110'
    >
      {children}
    </a>
  )
}

import { BookOpen, Github, Rss } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { ChangelogBlocks } from '@/app/changelog/components/changelog-blocks'
import ChangelogList from '@/app/changelog/components/timeline-list'
import { Breaks } from '@/app/changelog/components/variants/breaks'
import { Scroll } from '@/app/changelog/components/variants/scroll'

export interface ChangelogEntry {
  tag: string
  title: string
  content: string
  date: string
  url: string
  contributors?: string[]
}

export type ChangelogVariant = 'breaks' | 'scroll'

const VARIANTS = {
  breaks: Breaks,
  scroll: Scroll,
} as const

function extractMentions(body: string): string[] {
  const matches = body.match(/@([A-Za-z0-9-]+)/g) ?? []
  const uniq = Array.from(new Set(matches.map((m) => m.slice(1))))
  return uniq
}

interface ChangelogContentProps {
  variant?: ChangelogVariant
}

const RELEASES_PER_PAGE = 100
const MAX_RELEASE_PAGES = 10

interface GitHubRelease {
  prerelease: boolean
  tag_name: string
  name: string | null
  body: string | null
  published_at: string
  html_url: string
}

function mapReleasesToEntries(releases: GitHubRelease[]): ChangelogEntry[] {
  return releases
    .filter((release) => !release.prerelease)
    .map((release) => ({
      tag: release.tag_name,
      title: release.name || release.tag_name,
      content: String(release.body || ''),
      date: release.published_at,
      url: release.html_url,
      contributors: extractMentions(String(release.body || '')),
    }))
}

export default async function ChangelogContent({ variant }: ChangelogContentProps) {
  let entries: ChangelogEntry[] = []

  try {
    const allReleases: GitHubRelease[] = []

    for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
      const res = await fetch(
        `https://api.github.com/repos/simstudioai/sim/releases?per_page=${RELEASES_PER_PAGE}&page=${page}`,
        {
          headers: { Accept: 'application/vnd.github+json' },
          next: { revalidate: 3600 },
        }
      )

      if (!res.ok) break

      const releases: GitHubRelease[] = await res.json()
      if (!Array.isArray(releases) || releases.length === 0) break

      allReleases.push(...releases)

      if (releases.length < RELEASES_PER_PAGE) break
    }

    entries = mapReleasesToEntries(allReleases)
  } catch (err) {
    entries = []
  }

  if (variant) {
    const Layout = VARIANTS[variant]
    return <Layout entries={entries} />
  }

  return (
    <div className='min-h-screen bg-[#1C1C1C]'>
      <div id='changelog-grid' className='relative grid md:grid-cols-2'>
        {/* Left intro panel */}
        <div className='relative top-0 overflow-hidden border-[#2A2A2A] border-b px-6 py-16 sm:px-10 md:sticky md:h-dvh md:border-r md:border-b-0 md:px-12 md:py-24'>
          {/* Background card decoration */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute top-[-0.7vw] left-[-2.8vw] z-0 aspect-[344/328] w-[23.9vw] opacity-40'
          >
            <Image src='/landing/card-left.svg' alt='' fill className='object-contain' />
          </div>

          {/* Union decorative shape */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute right-[-20%] bottom-[-10%] z-0 w-[75%] rotate-90 opacity-80'
          >
            <Image
              src='/landing/union-right.svg'
              alt=''
              width={768}
              height={768}
              className='h-auto w-full'
            />
          </div>

          {/* Animated colored block decorations */}
          <ChangelogBlocks />

          <div className='relative z-10 mx-auto h-full max-w-xl md:flex md:flex-col md:justify-center'>
            <h1 className='mt-6 font-[430] font-season text-4xl text-white tracking-[-0.02em] sm:text-5xl'>
              Changelog
            </h1>
            <p className='mt-3 font-[430] font-season text-[#F6F6F0]/50 text-[14px] leading-[125%] tracking-[0.02em] sm:text-[16px]'>
              Stay up-to-date with the latest features, improvements, and bug fixes in Sim. All
              changes are documented here with detailed release notes.
            </p>

            <div className='mt-5 flex flex-wrap items-center gap-3'>
              <Link
                href='https://github.com/simstudioai/sim/releases'
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex h-[32px] items-center gap-[6px] rounded-[5px] border border-[#33C482] bg-[#33C482] px-[10px] font-[430] font-season text-[14px] text-black transition-[filter] hover:brightness-110'
              >
                <Github className='h-4 w-4' />
                View on GitHub
              </Link>
              <Link
                href='https://docs.sim.ai'
                className='inline-flex h-[32px] items-center gap-[6px] rounded-[5px] border border-[#2A2A2A] bg-[rgba(246,246,240,0.06)] px-[10px] font-[430] font-season text-[#F6F6F6] text-[14px] transition-all hover:bg-[rgba(246,246,240,0.1)]'
              >
                <BookOpen className='h-4 w-4' />
                Documentation
              </Link>
              <Link
                href='/changelog.xml'
                className='inline-flex h-[32px] items-center gap-[6px] rounded-[5px] border border-[#2A2A2A] bg-[rgba(246,246,240,0.06)] px-[10px] font-[430] font-season text-[#F6F6F6] text-[14px] transition-all hover:bg-[rgba(246,246,240,0.1)]'
              >
                <Rss className='h-4 w-4' />
                RSS Feed
              </Link>
            </div>
          </div>
        </div>

        {/* Right timeline */}
        <div className='relative px-4 py-10 sm:px-6 md:px-8 md:py-12'>
          <div className='relative max-w-2xl'>
            <ChangelogList initialEntries={entries} />
          </div>
        </div>
      </div>
    </div>
  )
}

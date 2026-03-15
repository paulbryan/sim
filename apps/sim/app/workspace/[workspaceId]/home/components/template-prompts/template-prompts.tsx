'use client'

import { useState } from 'react'
import { ChevronDown } from '@/components/emcn/icons'
import type { Category } from './consts'
import { CATEGORY_META, TEMPLATES } from './consts'

const FEATURED_TEMPLATES = TEMPLATES.filter((t) => t.featured)
const EXTRA_TEMPLATES = TEMPLATES.filter((t) => !t.featured)

function getGroupedExtras() {
  const groups: { category: Category; label: string; templates: typeof TEMPLATES }[] = []
  const byCategory = new Map<Category, typeof TEMPLATES>()

  for (const t of EXTRA_TEMPLATES) {
    const existing = byCategory.get(t.category)
    if (existing) {
      existing.push(t)
    } else {
      const arr = [t]
      byCategory.set(t.category, arr)
    }
  }

  for (const [key, meta] of Object.entries(CATEGORY_META)) {
    const cat = key as Category
    if (cat === 'popular') continue
    const items = byCategory.get(cat)
    if (items?.length) {
      groups.push({ category: cat, label: meta.label, templates: items })
    }
  }

  return groups
}

const GROUPED_EXTRAS = getGroupedExtras()

function getFirstSentence(prompt: string): string {
  const match = prompt.match(/^(.+?[.!?])\s/)
  return match ? match[1] : prompt.slice(0, 120)
}

interface TemplatePromptsProps {
  onSelect: (prompt: string) => void
}

export function TemplatePrompts({ onSelect }: TemplatePromptsProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className='flex flex-col gap-[24px]'>
      <div className='grid grid-cols-3 gap-[10px]'>
        {FEATURED_TEMPLATES.map((template) => (
          <TemplateCard key={template.title} template={template} onSelect={onSelect} />
        ))}
      </div>

      <button
        type='button'
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className='flex items-center justify-center gap-[6px] text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-body)]'
      >
        {expanded ? (
          <>
            Show less <ChevronDown className='h-[14px] w-[14px] rotate-180' />
          </>
        ) : (
          <>
            More examples <ChevronDown className='h-[14px] w-[14px]' />
          </>
        )}
      </button>

      {expanded && (
        <div className='flex flex-col gap-[32px]'>
          {GROUPED_EXTRAS.map((group) => (
            <div key={group.category} className='flex flex-col gap-[12px]'>
              <h3 className='font-medium text-[13px] text-[var(--text-secondary)]'>
                {group.label}
              </h3>
              <div className='grid grid-cols-3 gap-[10px]'>
                {group.templates.map((template) => (
                  <TemplateCard key={template.title} template={template} onSelect={onSelect} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface TemplateCardProps {
  template: (typeof TEMPLATES)[number]
  onSelect: (prompt: string) => void
}

function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const Icon = template.icon
  const description = getFirstSentence(template.prompt)

  return (
    <button
      type='button'
      onClick={() => onSelect(template.prompt)}
      aria-label={`Select template: ${template.title}`}
      className='group flex cursor-pointer flex-col gap-[10px] rounded-[12px] border border-[var(--border-1)] p-[14px] text-left transition-colors hover:bg-[var(--surface-3)]'
    >
      <div className='flex h-[28px] w-[28px] items-center justify-center rounded-[8px] bg-[var(--surface-3)] transition-colors group-hover:bg-[var(--surface-4)]'>
        <Icon className='h-[14px] w-[14px] text-[var(--text-icon)]' />
      </div>
      <div className='flex flex-col gap-[4px]'>
        <span className='text-[13px] text-[var(--text-body)] leading-[18px]'>{template.title}</span>
        <span className='line-clamp-2 text-[12px] text-[var(--text-tertiary)] leading-[16px]'>
          {description}
        </span>
      </div>
    </button>
  )
}

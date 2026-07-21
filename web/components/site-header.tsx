'use client'


import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X, ChevronDown, Apple, PlayCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// TODO: replace with the real support inbox
const SUPPORT_EMAIL = 'support@clearday.app'

// TODO: replace with the real App Store / Play Store URLs.
// Both currently point at the same placeholder (Spotify test) link.
const APP_LINK = 'https://play.google.com/store/apps/details?id=com.lunascroll.app'

const navLinks = [
  { label: 'Capture & Structure', href: '#data-engine' }, // capture & structuring
  { label: 'How It Works', href: '#platform' }, // engine logic / how it understands input
  { label: 'Use Cases', href: '#architecture' },
]

const legalLinks = [
  { label: 'About', href: '/about' },
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
]

const CTA_BUTTON_STYLE =
  'group relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-6 py-1.5 text-sm font-medium text-white border-t border-white/25 transition-all duration-300 ease-out'


  const ctaGradient = {
  backgroundImage:
    'linear-gradient(180deg, #4a3585 0%, #241a45 55%, #1a1230 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px -4px rgba(139,92,246,0.45), 0 0 0 1px rgba(139,92,246,0.15)',
}

const ctaGradientHover = {
  backgroundImage:
    'linear-gradient(180deg, #5c44a8 0%, #2e2159 55%, #1f1638 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.28), 0 12px 32px -4px rgba(168,85,247,0.65), 0 0 0 1px rgba(168,85,247,0.25)',
}

function StoreDropdown({ align = 'right' }: { align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={CTA_BUTTON_STYLE}
        style={open ? ctaGradientHover : ctaGradient}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, ctaGradientHover)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, open ? ctaGradientHover : ctaGradient)}
      >
        Try It Free
        <ChevronDown
          className={cn('ml-0.5 h-3.5 w-3.5 transition-transform duration-300', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      <div
        role="menu"
        className={cn(
          'absolute top-[calc(100%+10px)] z-50 w-56 origin-top overflow-hidden rounded-xl border border-border bg-background/95 p-1.5 shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out',
          align === 'right' ? 'right-0' : 'left-0',
          open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
        )}
      >
        <a
          href={APP_LINK}
          target="_blank"
          rel="noreferrer"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
        >
          <Apple className="h-4 w-4" aria-hidden="true" />
          App Store
        </a>
        <a
          href={APP_LINK}
          target="_blank"
          rel="noreferrer"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
        >
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          Google Play
        </a>
      </div>
    </div>
  )
}

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 md:px-8"
      >
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-semibold tracking-tight lowercase">
            clearday
          </span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <span className="mx-2 h-4 w-px bg-border" aria-hidden="true" />
          {legalLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Support
          </a>
        </div>

        <div className="hidden lg:flex">
          <StoreDropdown align="right" />
        </div>

        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-border bg-background/95 px-4 pb-6 pt-2 backdrop-blur-xl lg:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <div className="my-1 h-px bg-border" aria-hidden="true" />
            {legalLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Support
            </a>

            <div className="mt-4 flex justify-center">
              <StoreDropdown align="left" />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

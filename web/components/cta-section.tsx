'use client'

import dynamic from 'next/dynamic'
import { Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'

const CtaDiscs = dynamic(
  () => import('@/components/three/cta-discs').then((m) => m.CtaDiscs),
  { ssr: false },
)

const GRADIENT_TEXT =
  'linear-gradient(98deg, #8A7BF6 0%, #9B8CFF 25%, #D48AE8 60%, #FFA9D6 70%, #FFA9D6 80%, #FFA35F 90%, #FFB020 100%)'

// TODO: replace with real Clearday App Store / Play Store links once published
const APP_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.lunascroll.app'
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.lunascroll.app'

function StoreBadge({
  href,
  src,
  alt,
}: {
  href: string
  src: string
  alt: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center rounded-xl',
        'transition-transform duration-300 ease-out',
        'hover:scale-[1.04]',
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={160}
        height={48}
        className="h-12 w-auto"
      />
    </a>
  )
}

export function CtaSection() {
  return (
    <section id="cta" className="relative overflow-hidden py-32 md:py-44">
      <CtaDiscs />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, oklch(0.32 0.14 300 / 0.35), transparent 70%)',
        }}
      />
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 text-center">
        <h2 className="text-balance text-4xl font-medium tracking-tight md:text-6xl">
          We&apos;d love to{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: GRADIENT_TEXT }}
          >
            hear from you.
          </span>
        </h2>
        <p className="mt-5 max-w-xl text-pretty leading-relaxed text-muted-foreground">
          Question, feedback, or just want to say hello? Every message
          reaches a real person, not a support queue.
        </p>

        <a
          href="mailto:support@clearday.com"
          className={cn(
            'group relative mt-8 inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-8 py-3.5',
            'text-sm font-medium text-white',
            'border-t border-white/25',
            'transition-all duration-300 ease-out',
          )}
          style={{
            backgroundImage:
              'linear-gradient(180deg, #4a3585 0%, #241a45 55%, #1a1230 100%)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px -4px rgba(139,92,246,0.45), 0 0 0 1px rgba(139,92,246,0.15)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundImage =
              'linear-gradient(180deg, #5c44a8 0%, #2e2159 55%, #1f1638 100%)'
            e.currentTarget.style.boxShadow =
              'inset 0 1px 0 rgba(255,255,255,0.28), 0 12px 32px -4px rgba(168,85,247,0.65), 0 0 0 1px rgba(168,85,247,0.25)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundImage =
              'linear-gradient(180deg, #4a3585 0%, #241a45 55%, #1a1230 100%)'
            e.currentTarget.style.boxShadow =
              'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px -4px rgba(139,92,246,0.45), 0 0 0 1px rgba(139,92,246,0.15)'
          }}
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Get in Touch
        </a>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-6">
          <StoreBadge href={APP_STORE_URL} src="/images/apple.png" alt="Download on the App Store" />
          <StoreBadge href={PLAY_STORE_URL} src="/images/google.png" alt="Get it on Google Play" />
        </div>
      </div>
    </section>
  )
}

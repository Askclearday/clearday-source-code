'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const DataBars = dynamic(
  () => import('@/components/three/data-bars').then((m) => m.DataBars),
  { ssr: false },
)

// New gradient direction: violet → orchid → apricot pink.
// Used for the ambient section glow, gradient text, each card's active-state
// shadow, and the CTA button's hover glow.
const GRADIENT_TEXT =
  'linear-gradient(98deg, #8A7BF6 0%, #9B8CFF 25%, #D48AE8 60%, #FFA9D6 100%)'

const GLOW_A = 'rgba(138, 123, 246, 0.45)' // violet — #8A7BF6
const GLOW_B = 'rgba(212, 138, 232, 0.35)' // orchid — #D48AE8
const GLOW_C = 'rgba(255, 169, 214, 0.35)' // apricot pink — #FFA9D6

const layers = [
  {
    id: 'capture',
    label: 'Capture & Structuring',
    body: 'Say a full paragraph or a single stray thought — Clearday splits it into the reminders, events, and notes it actually contains, without asking you to sort anything first.',
    cta: 'See Capture In Action',
  },
  {
    id: 'context',
    label: 'Context & Timing',
    body: 'Phrases like "before lunch" or "while I\u2019m cooking" get resolved against what\u2019s already on your calendar, and a deadline gets a nudge hours ahead of time — not the moment it\u2019s already too late.',
    cta: 'See How Timing Works',
  },
  {
    id: 'brief',
    label: 'The Daily Brief',
    body: 'Three short, spoken check-ins a day — morning, afternoon, and evening — so you get the shape of your day without opening a dashboard to go find it.',
    cta: 'Hear A Sample Brief',
  },
]

// The middle card ("Context & Timing") is the one that glows by default.
const DEFAULT_FEATURED = 'context'

export function ArchitectureSection() {
  const [featured, setFeatured] = useState(DEFAULT_FEATURED)

  // Whichever card is featured always renders in the middle slot, with the
  // other two filling the top/bottom slots in their original relative
  // order — so clicking a card jumps it to the center instead of just
  // expanding it in place.
  const others = layers.filter((l) => l.id !== featured)
  const featuredLayer = layers.find((l) => l.id === featured) ?? layers[1]
  const orderedLayers = [others[0], featuredLayer, others[1]]

  return (
    <section id="architecture" className="relative overflow-hidden py-24 md:py-32">
      {/* ambient glow — violet and apricot blobs, matching the new gradient direction */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: `
            radial-gradient(ellipse 45% 40% at 28% 35%, ${GLOW_A}, transparent 70%),
            radial-gradient(ellipse 45% 40% at 75% 60%, ${GLOW_C}, transparent 70%)
          `,
        }}
      />

      {/* min-w-0 here matters: without it, a wide/unbroken line inside the
          content below can force this whole container past max-w-7xl,
          which is what was pushing the row (cards + canvas) off to the
          right and throwing off the canvas's apparent centering. */}
      <div className="relative mx-auto max-w-7xl min-w-0 px-4 md:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span
            className="bg-clip-text text-xs font-medium uppercase tracking-widest text-transparent"
            style={{ backgroundImage: GRADIENT_TEXT }}
          >
            How Clearday Works
          </span>
          <h2 className="mt-4 text-balance text-4xl font-medium tracking-tight md:text-5xl">
            Say Anything That&apos;s on Your Mind And Get A Well Structured Day Out.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Whether you&apos;re firing off a quick reminder or dumping your
            whole afternoon in one breath, Clearday breaks it down the same
            way — captured, understood, and timed against the rest of your
            day.
          </p>

          <a
            href="#resources"
            className={cn(
              'group relative mt-6 inline-flex items-center gap-1.5 rounded-full px-6 py-2.5',
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
            Explore Every Feature
            <ArrowRight className="ml-0.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
        </div>

        {/* min-w-0 on both grid children stops either one from stretching
            the row past the container based on its content's natural size —
            the actual fix for the overflow / off-center issue. */}
        <div className="mt-16 grid min-w-0 items-start gap-12 lg:grid-cols-2">
          <div className="flex min-w-0 w-full flex-col gap-4">
            {orderedLayers.map((layer) => {
              const isFeatured = featured === layer.id
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setFeatured(layer.id)}
                  aria-pressed={isFeatured}
                  className={cn(
                    'w-full min-w-0 rounded-xl border text-left transition-all duration-300 cursor-pointer',
                    isFeatured
                      ? 'border-primary/50 bg-card p-10 md:p-12'
                      : 'border-transparent p-6 hover:border-border hover:bg-card/50',
                  )}
                  style={
                    isFeatured
                      ? {
                          boxShadow: `0 0 55px -14px ${GLOW_A}, 0 0 80px -18px ${GLOW_C}`,
                        }
                      : undefined
                  }
                >
                  <h3
                    className={cn(
                      'font-medium',
                      isFeatured ? 'text-xl text-foreground' : 'text-lg text-muted-foreground',
                    )}
                  >
                    {layer.label}
                  </h3>
                  {isFeatured && (
                    <div className="mt-4">
                      <p className="text-sm leading-relaxed text-muted-foreground break-words">
                        {layer.body}
                      </p>
                      <a
                        href="#data-engine"
                        className="mt-4 inline-flex items-center gap-1 bg-clip-text text-sm font-medium text-transparent hover:underline"
                        style={{ backgroundImage: GRADIENT_TEXT }}
                      >
                        {layer.cta}
                        <ArrowRight className="h-3.5 w-3.5 text-[#D48AE8]" aria-hidden="true" />
                      </a>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mx-auto h-[580px] mt-[-100px] md:mt-[-160px] w-full min-w-0 max-w-full overflow-hidden md:h-[860px]">
            <DataBars />
          </div>
        </div>
      </div>
    </section>
  )
}
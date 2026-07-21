'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ArrowRight, ChevronDown, ThumbsUp, ThumbsDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const GRADIENT_TEXT =
  'linear-gradient(98deg, #8A7BF6 0%, #9B8CFF 25%, #D48AE8 60%, #FFA9D6 100%)'

function RlhfDemo() {
  const [choice, setChoice] = useState<'a' | 'b' | null>(null)
  const [rated, setRated] = useState(false)

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background/60">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-chart-3/70" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent/70" aria-hidden="true" />
        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
          clearday-capture-preview
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="self-end rounded-lg rounded-br-sm bg-primary/20 px-3 py-2 text-xs leading-relaxed text-foreground">
          "Submit the report by midnight, and dinner with Sarah Thursday at 7."
        </div>
        {(['a', 'b'] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              setChoice(opt)
              setRated(true)
            }}
            className={cn(
              'rounded-lg rounded-bl-sm border px-3 py-2 text-left text-xs leading-relaxed transition-all',
              choice === opt
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/40',
            )}
          >
            <span
              className="mb-1 flex items-center gap-1 bg-clip-text font-mono text-[10px] uppercase tracking-wider text-transparent"
              style={{ backgroundImage: GRADIENT_TEXT }}
            >
              Breakdown {opt.toUpperCase()}
              {choice === opt && <Check className="h-3 w-3 text-foreground" aria-hidden="true" />}
            </span>
            {opt === 'a'
              ? 'Reminder: submit the report — nudge at 9pm, three hours ahead of the deadline. Event: dinner with Sarah, Thursday 7pm.'
              : 'Remember the report thing and something with Sarah sometime.'}
          </button>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-[11px] text-muted-foreground">
            {rated
              ? 'Got it — that\u2019s the kind of breakdown Clearday aims for'
              : 'Select the breakdown you\u2019d actually want'}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label="Thumbs up"
              onClick={() => setRated(true)}
              className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Thumbs down"
              onClick={() => setRated(true)}
              className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const blocks = [
  {
    id: 'rlhf',
    title: 'Capture & Structuring',
    subtitle: 'Say it once, in whatever form it comes out',
    body: 'Clearday listens for what something actually is, not just how it was phrased. A task, an appointment, and a passing thought said in the same breath get separated automatically — no folders, no categories, nothing to sort yourself.',
    detail:
      'Every capture runs through the same pipeline in a single pass: intent detection, category classification, and timing resolution — whether you say one thing or five things at once. Relational phrases like "before" or "while" get resolved against whatever\u2019s already on your calendar, so nothing needs a category or a time typed in by hand.',
    ctas: ['Learn More', 'Try Capture'],
    ctaStatus: 'Coming soon to iOS & Android',
    demo: true,
    image: null,
    reverse: false,
  },
  {
    id: 'labeling',
    title: 'Reminders',
    subtitle: 'Deadlines that nudge you ahead of time, not the moment they land',
    body: 'Tell Clearday something is due by midnight and it works backward from there — surfacing a nudge with real time to act, instead of an alert the second it is already too late. It checks back afterward, too, to confirm it actually got done.',
    detail:
      'Clearday weighs how much lead time a task realistically needs, not just its deadline — a report due at midnight might get a nudge at 6pm, while a five-minute errand gets one twenty minutes out. Once the deadline passes, it checks back once to confirm the task actually got done, so nothing quietly falls through.',
    ctas: ['Learn More', 'Set A Reminder'],
    ctaStatus: 'Available inside the Clearday app',
    demo: false,
    image: '/images/reminders.png',
    imageAlt: 'Timeline view of a Clearday reminder nudging ahead of a deadline',
    reverse: true,
  },
  {
    id: 'curation',
    title: 'Calendar & Context',
    subtitle: 'One calendar that actually understands what is on it',
    body: 'Clearday reads for real-world context — tying an errand to the reservation it belongs to, flagging two commitments that land at the same time, and keeping every event, reminder, and note in one clear picture of your day.',
    detail:
      'Every reminder, event, and note lives on the same timeline, so Clearday can catch what a plain calendar can\u2019t — an errand that depends on another errand, two commitments landing at the same hour, or a task that only makes sense once something else on your day is finished.',
    ctas: ['Learn More', 'See Your Day'],
    ctaStatus: 'Open the app to see your full day',
    demo: false,
    image: '/images/calenders.png',
    imageAlt: 'Clearday calendar view highlighting a scheduling conflict',
    reverse: false,
  },
]

export function DataEngine() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [statusId, setStatusId] = useState<string | null>(null)

  const toggleOpen = (id: string) => {
    setOpenId((current) => (current === id ? null : id))
  }

  const showStatus = (id: string) => {
    setStatusId(id)
    window.setTimeout(() => {
      setStatusId((current) => (current === id ? null : current))
    }, 2500)
  }

  return (
    <section id="data-engine" className="relative overflow-hidden py-24 md:py-32">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 30% at 50% 0%, rgba(138, 123, 246, 0.25), transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span
            className="bg-clip-text text-xs font-medium uppercase tracking-widest text-transparent"
            style={{ backgroundImage: GRADIENT_TEXT }}
          >
            Under The Hood
          </span>
          <h2 className="mt-4 text-balance text-3xl font-medium tracking-tight md:text-5xl">
            The Clearday Engine
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Three systems working together on every single thing you say —
            so it gets captured, timed, and placed on your day correctly the
            first time.
          </p>
        </div>

        <div className="mt-16 flex flex-col  gap-6 md:gap-20">
          {blocks.map((block) => {
            const isOpen = openId === block.id
            return (
              <div
                key={block.id}
                className="grid items-center gap-8 rounded-2xl border border-border bg-card/60 p-6 backdrop-blur md:p-10 lg:grid-cols-2"
              >
                <div className={cn(block.reverse && 'lg:order-2')}>
                  {block.demo ? (
                    <RlhfDemo />
                  ) : (
                    <div className="relative aspect-[9/12] overflow-hidden rounded-xl border border-border">
                      <Image
                        src={block.image! || "/placeholder.svg"}
                        alt={block.imageAlt!}
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                      />
                    </div>
                  )}
                </div>
                <div className={cn('flex flex-col', block.reverse && 'lg:order-1')}>
                  <h3 className="text-2xl font-medium md:text-3xl">{block.title}</h3>
                  <p
                    className="mt-2 bg-clip-text text-sm font-medium text-transparent"
                    style={{ backgroundImage: GRADIENT_TEXT }}
                  >
                    {block.subtitle}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {block.body}
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-5">
                    <button
                      type="button"
                      onClick={() => toggleOpen(block.id)}
                      aria-expanded={isOpen}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-white/90 transition-colors hover:text-white"
                    >
                      {block.ctas[0]}
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 transition-transform duration-300',
                          isOpen && 'rotate-180',
                        )}
                        aria-hidden="true"
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => showStatus(block.id)}
                      className={cn(
                        'group relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-6 py-2.5',
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
                      {statusId === block.id ? block.ctaStatus : block.ctas[1]}
                      <ArrowRight className="ml-0.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </button>
                  </div>

                  {/* Learn More detail panel — pure CSS grid-rows accordion, no layout jump */}
                  <div
                    className={cn(
                      'grid transition-all duration-300 ease-out',
                      isOpen ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="rounded-lg border border-border bg-background/50 p-4 text-lg leading-relaxed text-muted-foreground md:text-xl">
                        {block.detail}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'

const GRADIENT_TEXT =
  'linear-gradient(98deg, #8A7BF6 0%, #9B8CFF 25%, #D48AE8 60%, #FFA9D6 100%)'

const cases = [
  {
    tag: 'Blog',
    title: 'How Clearday Turns One Sentence Into a Structured Day',
    image: '/images/case-1.png',
    alt: 'Abstract illustration of scattered thoughts resolving into an ordered timeline',
    detail:
      'Most planning tools start by asking you to decide what something is before you\u2019re allowed to write it down — is this a task, an event, a note? That upfront sorting is exactly the kind of friction that makes people abandon a planner within a week. Clearday removes that step entirely. You say whatever is on your mind, in whatever order it comes out, and the classification happens after the fact, not before. A single sentence like "call mom before her birthday, and submit the report by midnight" gets split into two separate items, each correctly typed, each given a sensible time, without you ever touching a dropdown or a category picker. The same logic extends to compound thoughts — a task, an appointment, and a passing idea said in one breath get separated individually rather than merged into a single vague entry. The goal isn\u2019t just convenience; it\u2019s removing the one piece of friction that quietly causes most people to stop using a planning tool in the first place: the requirement to organize your thoughts before you\u2019re even allowed to record them.',
  },
  {
    tag: 'Blog',
    title: 'The Problem With Reminders That Fire Too Late',
    image: '/images/case-2.png',
    alt: 'Clock face with a reminder notification arriving after a deadline',
    detail:
      'A deadline reminder that fires the moment the deadline arrives isn\u2019t really a reminder — it\u2019s a notice that you\u2019ve already run out of time. Most reminder systems treat every deadline identically: store the time, alert at the time. But a five-minute errand and a two-hour report don\u2019t need the same lead time, and firing both alerts at the exact due moment guarantees that at least one of them arrives too late to be useful. Clearday reasons about lead time the same way a thoughtful assistant would: a task due at midnight gets a nudge hours earlier, scaled to roughly how long the task is likely to take, so there\u2019s still real room to act. And because a reminder that\u2019s easy to dismiss and forget is just as useless as one that arrives too late, Clearday checks back in after the deadline passes to confirm whether the task actually got done, rather than assuming silence means completion. The result is a reminder system that behaves less like an alarm clock and more like someone who actually knows how long things take.',
  },
  {
    tag: 'Blog',
    title: 'Why One Calendar Was Never Enough on Its Own',
    image: '/images/case-3.png',
    alt: 'Overlapping calendar events colliding on a single day',
    detail:
      'A calendar only knows about the things you\u2019ve explicitly put on it. It has no idea that the "buy flowers" errand you jotted down is actually connected to the dinner reservation three hours later, or that two commitments you added on separate days now overlap. Most people discover conflicts like these by accident — scrolling through the week and noticing, with some dread, that two things are stacked on top of each other. Clearday treats every reminder, event, and note as part of one connected picture of your day rather than isolated entries on a grid. That means it can tie a task to the appointment it depends on and schedule it with a sensible buffer, and it means double-bookings get surfaced the moment they\u2019re created rather than discovered days later when it\u2019s too late to fix them gracefully. A calendar shows you where things are. Clearday is concerned with whether they actually fit together.',
  },
  {
    tag: 'Blog',
    title: 'Teaching an Assistant to Understand "Before" and "While"',
    image: '/images/case-4.png',
    alt: 'Abstract illustration of connected timeline nodes representing relative time',
    detail:
      'Real speech is full of relative time — "before the meeting," "while I\u2019m cooking," "after lunch, but not too late." None of that means anything on its own; it only makes sense in relation to something else already happening in your day. Most natural-language reminder tools handle absolute times well and fall apart the moment the phrasing turns relative, defaulting to a generic time or, worse, silently dropping the context entirely. Clearday resolves these phrases against what\u2019s actually already scheduled: "buy flowers for the date" gets tied to the dinner reservation already saved and scheduled a few sensible hours ahead of it, and "remind me while I\u2019m cooking" attaches itself to whatever cooking-related event or habit already exists on your day. Meal-based phrasing gets the same treatment — a "before dinner" reminder lands at a realistic hour, not at ten at night. The underlying idea is simple: people don\u2019t think in absolute timestamps, they think in relation to the rest of their day, so an assistant that only understands clock time is only half listening.',
  },
]

export function CaseStudies() {
  const [openTitle, setOpenTitle] = useState<string | null>(null)
  const active = cases.find((c) => c.title === openTitle) ?? null

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenTitle(null)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [active])

  return (
    <section id="customers" className="mx-auto max-w-7xl px-4 py-24 md:px-8 md:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <span
          className="bg-clip-text text-xs font-medium uppercase tracking-widest text-transparent"
          style={{ backgroundImage: GRADIENT_TEXT }}
        >
          Learn How Clearday Thinks
        </span>
        <h2 className="mt-4 text-balance text-3xl font-medium tracking-tight md:text-5xl">
          Notes &amp; Resources
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          A closer look at how Clearday captures, times, and structures your
          day — and the everyday problems that shaped why it works this way.
        </p>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cases.map((c) => (
          <div
            key={c.title}
            className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-[0_0_40px_-12px_var(--glow)]"
          >
            <div className="relative aspect-[4/3] overflow-hidden">
              <Image
                src={c.image || "/placeholder.svg"}
                alt={c.alt}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5">
              <span
                className="bg-clip-text text-[10px] font-medium uppercase tracking-widest text-transparent"
                style={{ backgroundImage: GRADIENT_TEXT }}
              >
                {c.tag}
              </span>
              <h3 className="text-sm font-medium leading-snug">{c.title}</h3>

              <button
                type="button"
                onClick={() => setOpenTitle(c.title)}
                className="mt-auto inline-flex w-fit cursor-pointer items-center gap-1 pt-2 text-xs text-muted-foreground transition-colors hover:text-[#D48AE8]"
              >
                Show More
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* popup */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpenTitle(null)}
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
        >
          <div
            className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-[16/7] w-full shrink-0 overflow-hidden">
              <Image
                src={active.image || "/placeholder.svg"}
                alt={active.alt}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 700px"
              />
              <button
                type="button"
                onClick={() => setOpenTitle(null)}
                aria-label="Close"
                className="absolute right-3 top-3 inline-flex cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 md:p-8">
              <span
                className="bg-clip-text text-[10px] font-medium uppercase tracking-widest text-transparent"
                style={{ backgroundImage: GRADIENT_TEXT }}
              >
                {active.tag}
              </span>
              <h3 className="mt-2 text-xl font-medium leading-snug md:text-2xl">
                {active.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
                {active.detail}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
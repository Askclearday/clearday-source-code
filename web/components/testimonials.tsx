'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const GRADIENT_TEXT =
  'linear-gradient(98deg, #8A7BF6 0%, #9B8CFF 25%, #D48AE8 60%, #FFA9D6 100%)'

const quotes = [
  {
    quote:
      'I stopped rewriting the same three reminders every morning. I just say what\u2019s on my mind and it ends up in the right place, at the right time, on its own.',
    name: 'Early Clearday user',
    role: 'Beta tester',
  },
  {
    quote:
      'The nudge before a deadline instead of right at it is such a small thing, but it\u2019s the difference between actually finishing something and scrambling at the last minute.',
    name: 'Early Clearday user',
    role: 'Beta tester',
  },
  {
    quote:
      'I said "buy flowers for the date" once and it figured out the timing on its own. That\u2019s the first planner that\u2019s ever felt like it was actually paying attention.',
    name: 'Early Clearday user',
    role: 'Beta tester',
  },
]

export function Testimonials() {
  const [index, setIndex] = useState(0)

  const prev = () => setIndex((i) => (i - 1 + quotes.length) % quotes.length)
  const next = () => setIndex((i) => (i + 1) % quotes.length)
  const q = quotes[index]

  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 50% 60%, rgba(138, 123, 246, 0.25), transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-4xl px-4 text-center md:px-8">
        <span
          className="bg-clip-text text-xs font-medium uppercase tracking-widest text-transparent"
          style={{ backgroundImage: GRADIENT_TEXT }}
        >
          Early Impressions
        </span>
        <h2 className="mt-4 text-balance text-3xl font-medium tracking-tight md:text-5xl">
          What it feels like once Clearday knows your day.
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          Notes from people testing Clearday early — on what changed once
          capture, timing, and the daily brief stopped being something they
          had to manage themselves.
        </p>

        <figure className="mt-12 rounded-2xl border border-border bg-card/60 p-8 backdrop-blur md:p-12">
          <blockquote className="text-pretty text-lg leading-relaxed md:text-xl">
            &ldquo;{q.quote}&rdquo;
          </blockquote>
          <figcaption className="mt-6">
            <span className="block text-sm font-medium">{q.name}</span>
            <span className="block text-xs text-muted-foreground">{q.role}</span>
          </figcaption>
        </figure>

        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous testimonial"
            className="cursor-pointer rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-2" role="tablist" aria-label="Testimonials">
            {quotes.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Testimonial ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  'h-2 w-2 cursor-pointer rounded-full transition-all',
                  i === index ? 'w-6 bg-primary' : 'bg-border hover:bg-muted-foreground',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            aria-label="Next testimonial"
            className="cursor-pointer rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  )
}
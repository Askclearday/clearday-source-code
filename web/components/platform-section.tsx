'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const GRADIENT_TEXT =
  'linear-gradient(98deg, #8A7BF6 0%, #9B8CFF 25%, #D48AE8 60%, #FFA9D6 100%)'

const codeLines = [
  '> "call mom before her birthday, submit',
  '   the report by midnight"',
  '',
  'clearday.capture(input)',
  '',
  '{',
  '  reminder: "call mom",',
  '  due: "Thu 6:00pm — 2 days ahead",',
  '  reminder: "submit the report",',
  '  due: "11:00pm — 1hr buffer",',
  '}',
  '',
  '✓ captured, categorized, and timed',
]

function TypingCode() {
  const [visible, setVisible] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible((v) => (v >= codeLines.length ? 0 : v + 1))
    }, 600)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="h-full overflow-hidden rounded-xl border border-border bg-background/80 p-4">
      <pre className="font-mono text-xs leading-6 text-muted-foreground">
        {codeLines.slice(0, visible).map((line, i) => (
          <div key={i}>
            <span className="mr-3 select-none text-muted-foreground/40">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className={line.includes('clearday') ? 'text-accent' : undefined}>
              {line || ' '}
            </span>
          </div>
        ))}
        <span className="ml-8 inline-block h-4 w-2 animate-pulse bg-primary align-middle" aria-hidden="true" />
      </pre>
    </div>
  )
}

function AppDemo() {
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([
    {
      role: 'assistant',
      text: 'Ask me anything about your day.',
    },
  ])

  const send = () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    setMessages((m) => [
      ...m,
      { role: 'user', text: trimmed },
      {
        role: 'assistant',
        text: 'You\u2019ve got two reminders left today and dinner with Sarah at 7pm — nothing overlapping. Want tomorrow\u2019s outlook too?',
      },
    ])
    setPrompt('')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-background/80">
      <div className="border-b border-border px-4 py-2.5">
        <span className="font-mono text-[10px] text-muted-foreground">
          clearday-daily-brief
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.slice(-4).map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'self-end rounded-lg rounded-br-sm bg-primary/20 px-3 py-2 text-xs text-foreground'
                : 'self-start rounded-lg rounded-bl-sm bg-secondary px-3 py-2 text-xs text-muted-foreground'
            }
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-border p-3">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            )
              send()
          }}
          placeholder="Ask about your day..."
          aria-label="Chat prompt"
          className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={send}
          className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Send
        </button>
      </div>
    </div>
  )
}

const panels = [
  {
    id: 'capture-engine',
    eyebrow: 'How It Parses',
    title: 'See What Happens When You Speak',
    body: 'Say something loosely, in real time, and watch it get classified, timed, and structured — no form, no fields, nothing to fill in yourself.',
    detail:
      'Every capture is broken down in a single pass: what it is, what it depends on, and when it actually needs to happen. Relational phrases resolve against your existing calendar and reminders automatically, and a deadline always gets a nudge with real time to act attached to it — not just the deadline itself.',
    ctaLabel: 'See How Capture Works',
    demo: 'code' as const,
  },
  {
    id: 'daily-brief',
    eyebrow: 'Ask Your Day',
    title: 'Talk To Your Day Like A Person',
    body: 'Ask what\u2019s still outstanding, what\u2019s coming up, or what tomorrow looks like, and get a plain-language answer back — the same voice your daily brief speaks in.',
    detail:
      'The same engine behind your morning and evening brief is available any time you have a question — outstanding reminders, today\u2019s remaining events, conflicts on the horizon, or a quick look at tomorrow, all answered in natural language instead of a dashboard you have to go dig through.',
    ctaLabel: 'See What Else It Can Answer',
    demo: 'chat' as const,
  },
]

export function PlatformSection() {
  const [openId, setOpenId] = useState<string | null>(null)

  const toggleOpen = (id: string) => {
    setOpenId((current) => (current === id ? null : id))
  }

  return (
    <section id="platform" className="relative overflow-hidden py-24 md:py-32">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 50% 35% at 50% 30%, rgba(138, 123, 246, 0.3), transparent 70%)',
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
            The Clearday Platform
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            One system handling the entire lifecycle of everything you say —
            capture, timing, structuring, and the plain-language brief that
            brings it all back to you.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          {panels.map((panel) => {
            const isOpen = openId === panel.id
            return (
              <div
                key={panel.id}
                className="flex flex-col rounded-2xl border border-border bg-card/60 p-6 backdrop-blur md:p-8"
              >
                <span
                  className="bg-clip-text font-mono text-[10px] uppercase tracking-widest text-transparent"
                  style={{ backgroundImage: GRADIENT_TEXT }}
                >
                  {panel.eyebrow}
                </span>
                <h3 className="mt-3 text-xl font-medium md:text-2xl">
                  {panel.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {panel.body}
                </p>
                <div className="mt-6 h-72">
                  {panel.demo === 'code' ? <TypingCode /> : <AppDemo />}
                </div>

                <button
                  type="button"
                  onClick={() => toggleOpen(panel.id)}
                  aria-expanded={isOpen}
                  className={cn(
                    'group relative mt-6 inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full px-6 py-2.5',
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
                  {panel.ctaLabel}
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform duration-300',
                      isOpen && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </button>

                {/* expands in place with more detail — no navigation, no external link */}
                <div
                  className={cn(
                    'grid transition-all duration-300 ease-out',
                    isOpen ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="rounded-lg border border-border bg-background/50 p-4 text-sm leading-relaxed text-muted-foreground">
                      {panel.detail}
                    </p>
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
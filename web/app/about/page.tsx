import Image from 'next/image'
import { ArrowRight, Mail, Sparkles, Target, Heart } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'

export const metadata = {
  title: 'About | ClearDay',
  description:
    'Why we built ClearDay, what we believe about how planning should work, and the person behind it.',
}

const GRADIENT_TEXT =
  'linear-gradient(98deg, #8A7BF6 0%, #9B8CFF 25%, #D48AE8 60%, #FFA9D6 100%)'

const GLOW_A = 'rgba(138, 123, 246, 0.45)' // violet
const GLOW_B = 'rgba(212, 138, 232, 0.35)' // orchid
const GLOW_C = 'rgba(255, 169, 214, 0.35)' // apricot pink

const CTA_BUTTON_STYLE =
  'group relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-medium text-white border-t border-white/25 transition-all duration-300 ease-out hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_12px_32px_-4px_rgba(168,85,247,0.65),0_0_0_1px_rgba(168,85,247,0.25)]'

const ctaGradient = {
  backgroundImage:
    'linear-gradient(180deg, #4a3585 0%, #241a45 55%, #1a1230 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px -4px rgba(139,92,246,0.45), 0 0 0 1px rgba(139,92,246,0.15)',
}

const stats = [
  { value: '3', label: 'Daily briefs — morning, afternoon, evening' },
  { value: '1', label: 'Sentence needed to plan your whole day' },
  { value: '0', label: 'Dropdowns, folders, or categories to sort' },
]

const values = [
  {
    icon: Sparkles,
    title: 'Say it once',
    body: 'You should never have to translate your own thoughts into a system\u2019s format. If you can say it out loud, ClearDay can use it — one sentence, no sorting required.',
  },
  {
    icon: Target,
    title: 'Timing is the product',
    body: 'A reminder that fires the moment a deadline hits isn\u2019t a reminder, it\u2019s a notice that you\u2019re already out of time. ClearDay nudges you hours ahead, scaled to how long the task actually takes.',
  },
  {
    icon: Heart,
    title: 'Built for one person at a time',
    body: 'Not a team dashboard, not a shared workspace. ClearDay is designed around a single person\u2019s day, the way a good assistant would think about it.',
  },
]

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="relative overflow-hidden">
        {/* ---------------- Hero ---------------- */}
        <section className="relative overflow-hidden pt-40 pb-24 md:pt-48 md:pb-32">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{
              background: `
                radial-gradient(ellipse 45% 40% at 25% 20%, ${GLOW_A}, transparent 70%),
                radial-gradient(ellipse 45% 40% at 80% 30%, ${GLOW_C}, transparent 70%)
              `,
            }}
          />
          <div className="relative mx-auto max-w-3xl px-4 text-center md:px-8">
            <span
              className="bg-clip-text text-base font-medium uppercase tracking-widest text-transparent md:text-lg"
              style={{ backgroundImage: GRADIENT_TEXT }}
            >
              About ClearDay
            </span>
            <h1 className="mt-4 text-balance text-4xl font-medium tracking-tight md:text-6xl">
              We built the planner we actually wanted to use.
            </h1>
            <p className="mt-6 text-pretty leading-relaxed text-muted-foreground md:text-lg">
              ClearDay exists because planning your day shouldn&apos;t require
              learning how to use another app first. Say what&apos;s on your
              mind, and ClearDay turns it into the reminders, events, and
              notes — timed against the rest of your day,
              not just stored on a list.
            </p>
          </div>

          <div className="relative mx-auto mt-12 max-w-5xl px-4 md:px-8">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border md:aspect-[16/7]">
              <Image
                src="/images/about.png"
                alt="ClearDay app preview"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 1000px"
              />
            </div>
          </div>
        </section>



        {/* ---------------- Our Story ---------------- */}
        <section id="story" className="relative overflow-hidden py-24 md:py-32">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{
              background: `radial-gradient(ellipse 55% 35% at 50% 40%, ${GLOW_B}, transparent 70%)`,
            }}
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2 md:px-8">
            <div>
              <span
                className="bg-clip-text text-xs font-medium uppercase tracking-widest text-transparent"
                style={{ backgroundImage: GRADIENT_TEXT }}
              >
                Our Story
              </span>
              <h2 className="mt-4 text-balance text-3xl font-medium tracking-tight md:text-4xl">
                It started with a notes app full of things that never got done.
              </h2>
              <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground md:text-base">
                <p>
                  Every reminder app we tried made us do the organizing
                  ourselves first — pick a category, pick a time, pick a
                  list — before it would even let us write the thing down.
                  That upfront sorting was exactly the kind of friction that
                  made the app get abandoned within a week, every time.
                </p>
                <p>
                  So we asked a simpler question: what if you just said the
                  thing, the way you&apos;d say it to a person, and the app
                  figured out the rest? A stray thought, a deadline, an
                  errand tied to an appointment three hours later — all said
                  in one breath, sorted after the fact instead of before it.
                </p>
                <p>
                  That question became ClearDay: a capture engine that
                  understands what you meant, a timing system that nudges
                  you with real time to act instead of the moment
                  it&apos;s already too late, and a daily brief that reads
                  your day back to you instead of making you go dig for it.
                </p>
              </div>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border">
              <Image
                src="/images/story.png"
                alt="Illustration representing the origin of ClearDay"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
        </section>

        {/* ---------------- Founder ---------------- */}
        <section id="founder" className="relative py-24 md:py-32">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span
                className="bg-clip-text text-xs font-medium uppercase tracking-widest text-transparent"
                style={{ backgroundImage: GRADIENT_TEXT }}
              >
                From The Founder
              </span>
              <h2 className="mt-4 text-balance text-3xl font-medium tracking-tight md:text-5xl">
                Built by one person, for people like you.
              </h2>
            </div>

            <div className="mt-16 grid items-center gap-10 rounded-2xl border border-border bg-card/60 p-8 backdrop-blur md:grid-cols-[280px_1fr] md:p-12">
              <div className="relative mx-auto aspect-square w-48 overflow-hidden rounded-full border border-border md:w-full">
                <Image
                  src="/images/founder.png"
                  alt="Photo of Aleko Mbelenzi, founder of ClearDay"
                  fill
                  className="object-cover"
                  sizes="280px"
                />
              </div>
              <div>
                <blockquote className="text-pretty text-lg leading-relaxed md:text-xl">
                  &ldquo;I didn&apos;t build ClearDay because I wanted to
                  start a company. I built it because I was tired of
                  reorganizing the same three reminders every morning. I
                  wanted something that just listened.&rdquo;
                </blockquote>
                <div className="mt-6">
                  <span className="block text-sm font-medium">
                    Aleko Mbelenzi
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Founder, ClearDay
                  </span>
                </div>
                <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                  Hi, I'm Aleko. I built ClearDay because I got tired of
                  fighting my own brain every morning. I'd wake up with
                  dozens of ideas, reminders, random thoughts, and things
                  I didn't want to forget, so I'd dump everything into my
                  notes app. The problem wasn't capturing the thoughts—it
                  was making sense of them afterward. Every day I'd spend
                  far too long sorting through a wall of messy notes,
                  deciding what actually mattered and what I should do
                  first. Eventually I stopped looking for an app that
                  solved the problem and decided to build it myself.
                  ClearDay started as a tool for my own daily life, but
                  the more I used it, the more I realized this wasn't just
                  my problem. Most of us have busy minds, but organizing
                  those thoughts shouldn't feel like another task. Today I
                  still design, build, and ship every part of ClearDay
                  myself, so when you reach out, you're talking directly
                  to the person creating it.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Get in touch ---------------- */}
        <section id="contact" className="relative overflow-hidden py-24 md:py-32">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{
              background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${GLOW_A}, transparent 70%)`,
            }}
          />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center px-4 text-center md:px-8">
            <h2 className="text-balance text-3xl font-medium tracking-tight md:text-5xl">
              We&apos;d love to{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: GRADIENT_TEXT }}
              >
                hear from you.
              </span>
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              Question, feedback, or just want to say hello? Every message
              reaches a real person, not a support queue.
            </p>
            <a
              href="mailto:support@clearday.app"
              className={`${CTA_BUTTON_STYLE} mt-10`}
              style={ctaGradient}
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Get in Touch
              <ArrowRight
                className="ml-0.5 h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
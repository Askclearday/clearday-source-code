import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'

const resources = [
  {
    tag: 'Clearday Notes',
    title: 'Never Lose a Stray Thought Again',
    speaker: 'Voice or text',
    role: 'Either works',
    image: '/images/notes.png',
  },
  {
    tag: 'Clearday Reminders',
    title: 'Deadlines That Nudge You Ahead of Time',
    speaker: 'Hours of lead time',
    role: 'Not seconds',
    image: '/images/reminders.png',
  },
  {
    tag: 'Clearday Calendar',
    title: 'One Calendar That Catches Every Conflict',
    speaker: 'Every event synced',
    role: 'Nothing missed',
    image: '/images/calenders.png',
  },
]

export function FeaturedResources() {
  return (
    <section id="resources" className="px-4 py-16 bg-black md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="grid gap-4 md:gap-6 sm:grid-cols-2 md:grid-cols-3">
          {resources.map((r) => (
            <a
              key={r.title}
              href="#cta"
              className="group relative flex items-stretch gap-4 md:gap-6 overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-[0_0_40px_-12px_var(--glow)]"
            >
              <div className="relative w-38 h-50 shrink-0 overflow-hidden md:w-42 md:h-60">
                <Image
                  src={r.image || "/placeholder.svg"}
                  alt={`Illustration for ${r.tag}`}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="128px"
                />
              </div>
              <div className="flex flex-1 flex-col justify-center gap-1.5 py-4 pr-4">
                <span
                  className="bg-clip-text text-[10px] font-medium uppercase tracking-widest text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(98deg, #8A7BF6 0%, #9B8CFF 25%, #D48AE8 60%, #FFA9D6 70%, #FFA9D6 80%, #FFA35F 90%, #FFB020 100%)",
                  }}
                >
                  {r.tag}
                </span>
                <h3 className="text-sm font-medium leading-snug text-card-foreground">
                  {r.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {r.speaker} · {r.role}
                </p>
              </div>
              <ArrowUpRight
                className="absolute right-3 top-3 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

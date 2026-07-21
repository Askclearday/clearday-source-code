const stats = [
  'Thousands of reminders captured every week',
  'Zero manual sorting',
  'Works fully offline',
  'Three daily check-ins',
  'Deadlines flagged hours ahead, not seconds',
  'Built for one thing: your day',
  'No dashboards. No streaks. Just clarity.',
]

export function PartnersStrip() {
  return (
    <section className="bg-black pb-20 md:pb-[150px] pt-15 md:pt-[50px]">
      <div className="relative overflow-hidden">
        <div className="animate-marquee flex w-max items-center gap-16 px-8">
          {[...stats, ...stats].map((text, i) => (
            <span
              key={`${text}-${i}`}
              className="whitespace-nowrap font-mono text-lg text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              {text}
            </span>
          ))}
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent"
          aria-hidden="true"
        />
      </div>
    </section>
  )
}
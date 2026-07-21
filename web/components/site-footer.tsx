import Link from 'next/link'

// Trimmed way down from the Scale template — Clearday doesn't have a
// product suite, a blog, or a docs site yet, so there's no reason to
// fake columns of links that go nowhere.
const columns = [
  {
    heading: 'Company',
    links: [{ label: 'About', href: '/about' }],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms & Conditions', href: '/terms' },
    ],
  },
  {
    heading: 'Contact',
    links: [
      { label: 'info@askclearday.com', href: 'mailto:info@askclearday.com' },
      { label: 'support@askclearday.com', href: 'mailto:support@askclearday.com' },
    ],
  },
]

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer id="footer" className="border-t border-border bg-black">
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            {/* Styled identically to the column headings below (same size,
                weight, tracking, color, and mt-4 spacing on the text under
                it) so "Clearday" lines up exactly with "Company" / "Legal" /
                "Contact" instead of sitting larger and differently colored. */}
            <Link
              href="/"
              className="text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              Clearday
            </Link>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              An assistant for the parts of your day nobody else is
              tracking. Say it once — Clearday remembers.
            </p>
          </div>
          {columns.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {col.heading}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => {
                  const isInternal = link.href.startsWith('/')
                  return (
                    <li key={link.label}>
                      {isInternal ? (
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            </nav>
          ))}
        </div>
        {/* Divider that used to sit above this row has been removed per feedback —
            just spacing now, no border-t. */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {year} Clearday. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Westlands, Nairobi, Kenya
          </p>
        </div>
      </div>
    </footer>
  )
}
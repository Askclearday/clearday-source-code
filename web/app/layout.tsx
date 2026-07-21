import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'Clearday — Never Forget What Matters',
  description:
    'Tell Clearday whatever\'s on your mind, in whatever form it comes out. It works out what it actually is — a reminder, an event, or just a note — and when it actually needs to come back to you.',
  // If you'd rather keep this explicit instead of relying on the
  // app/icon.png file-convention below, this is the corrected version:
  // missing `type` and a `.ico` fallback are the two usual reasons a
  // manually-declared favicon silently doesn't render in some browsers.
 
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0a0714',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`dark bg-background ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased font-sans">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
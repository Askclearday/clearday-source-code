'use client'

import { useRef, useState, useCallback } from 'react'
import Image from 'next/image'

// TODO: replace with real Clearday App Store / Play Store links once published
const APP_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.lunascroll.app'
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.lunascroll.app'

// TODO: point this at your real screenshot filename in /public/images
const SCREENSHOT_SRC = '/images/hero.png'

export function Hero() {
  const screenshotRef = useRef<HTMLDivElement>(null)
  const DEFAULT_TILT = { rx: 10, ry: -10 } // simulates cursor resting at the top-left corner
  const DEFAULT_GLOW = { x: 0, y: 0 }
  const [tilt, setTilt] = useState(DEFAULT_TILT)
  const [glow, setGlow] = useState(DEFAULT_GLOW)
  const [hovering, setHovering] = useState(false)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = screenshotRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height

    const maxTilt = 10
    const ry = (px - 0.5) * maxTilt * 2
    const rx = (0.5 - py) * maxTilt * 2

    setTilt({ rx, ry })
    setGlow({ x: px * 100, y: py * 100 })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTilt(DEFAULT_TILT)
    setGlow(DEFAULT_GLOW)
    setHovering(false)
  }, [])

  return (
    <section className="relative flex min-h-[75vh] w-full flex-col items-center overflow-hidden bg-black pt-28 md:pt-36 lg:min-h-[85vh] lg:pt-0">
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
        @keyframes ambient-pulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.08); }
        }
        @keyframes sheen-sweep {
          0% { transform: translateX(-130%) skewX(-15deg); }
          100% { transform: translateX(130%) skewX(-15deg); }
        }
        .float-wrap {
          animation: float 5s ease-in-out infinite;
        }
        .ambient-glow {
          animation: ambient-pulse 4s ease-in-out infinite;
        }
        .sheen {
          animation: sheen-sweep 2.6s ease-in-out infinite;
        }
      `}</style>

      {/* radial glow overlay - spans full section, sits above the black bg */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 50% 35%, oklch(0.35 0.15 300 / 0.35), transparent 70%)',
        }}
      />

      {/* constrained container: max-w-7xl, split into two equal halves */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1450px] flex-1 flex-col items-center gap-16 px-4 pb-16 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:pb-0">
        {/* left half: text */}
        <div className="mt-16 flex w-full flex-col items-center text-center lg:mt-0 lg:w-1/2 lg:items-start lg:pr-8 lg:text-left">
          <h1
            className="text-balance leading-[1.05] tracking-[-0.045em] text-5xl md:text-6xl lg:text-7xl"
            style={{ fontWeight: 260 }}
          >
            <span className="text-white">Never </span>

            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(98deg, #8A7BF6 0%, #9B8CFF 25%, #D48AE8 60%, #FFA9D6 100%)",
              }}
            >
              forg
            </span>

            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(58deg, #FFA9D6 0%, #FFA35F 50%, #FFB020 100%)",
              }}
            >
              et{' '}
            </span>

            <br />

            <span className="text-white"> what matters. </span>
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-md leading-relaxed text-white/80 md:text-base">
            Tell Clearday what's on your mind, And we'll figure out if it is  — a reminder, a calender event, or
            just a note — and when it is the best time to be reminded.
          </p>

          <div className="mt-16 flex flex-col items-center gap-4 sm:flex-row sm:justify-center md:gap-8 lg:justify-start">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center transition-transform duration-300 ease-out hover:scale-[1.04]"
            >
              <Image
                src="/images/apple.png"
                alt="Download on the App Store"
                width={160}
                height={48}
                className="h-12 w-auto"
              />
            </a>

            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center transition-transform duration-300 ease-out hover:scale-[1.04]"
            >
              <Image
                src="/images/google.png"
                alt="Get it on Google Play"
                width={160}
                height={48}
                className="h-12 w-auto"
              />
            </a>
          </div>
        </div>

        {/* right half: animated app screenshot */}
        <div
          ref={screenshotRef}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={handleMouseLeave}
          className="relative flex w-full items-center justify-center lg:w-1/2"
        >
          {/* ambient background glow, pulses on its own regardless of hover */}
          <div
            className="ambient-glow pointer-events-none absolute h-[260px] w-[260px] rounded-full blur-3xl sm:h-[340px] sm:w-[340px] lg:h-[420px] lg:w-[420px]"
            style={{
              background:
                'radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(34,211,238,0.25) 45%, transparent 75%)',
            }}
          />

          <div
            className="float-wrap relative w-[88%] max-w-[1020px] cursor-pointer select-none"
            style={{ perspective: '1200px' }}
          >
            <div
              className="relative w-full transition-transform duration-300 ease-out"
              style={{
                transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${hovering ? 1.04 : 1})`,
                transformStyle: 'preserve-3d',
              }}
            >
              <div
                className="pointer-events-none absolute -inset-6 rounded-[2rem] blur-2xl transition-opacity duration-300"
                style={{
                  opacity: hovering ? 0.7 : 0,
                  background: `radial-gradient(circle at ${glow.x}% ${glow.y}%, rgba(244,114,182,0.55), rgba(168,85,247,0.35) 40%, transparent 70%)`,
                }}
              />

              <div
                className="relative overflow-hidden rounded-[1.75rem] shadow-2xl"
                style={{
                  boxShadow:
                    '0 25px 60px -15px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                <Image
                  src={SCREENSHOT_SRC}
                  alt="Clearday app screenshot"
                  width={820}
                  height={1040}
                  className="h-auto w-full"
                  priority
                />

                {hovering && (
                  <div
                    className="sheen pointer-events-none absolute inset-y-0 left-0 w-1/3"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

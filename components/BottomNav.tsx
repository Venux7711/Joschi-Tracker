'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const PRIMARY = [
  { href: '/dashboard', emoji: '🏠', label: 'Heute' },
  { href: '/history', emoji: '📋', label: 'Verlauf' },
  { href: '/pantry', emoji: '🥫', label: 'Vorrat' },
  { href: '/fotos', emoji: '📸', label: 'Fotos', match: ['/fotos', '/slideshow'] },
]

const MORE = [
  { href: '/chat', emoji: '💬', label: 'Chat' },
  { href: '/collage', emoji: '🗓️', label: 'Woche' },
  { href: '/gewicht', emoji: '⚖️', label: 'Gewicht' },
  { href: '/medikamente', emoji: '💊', label: 'Medis' },
  { href: '/report', emoji: '📊', label: 'Report' },
  { href: '/wrapped', emoji: '🎁', label: 'Wrapped' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)

  // Close drawer on route change
  useEffect(() => { setShowMore(false) }, [pathname])

  const hidden = ['/login', '/auth', '/wrapped', '/slideshow'].some(p => pathname.startsWith(p))
  if (hidden) return null

  const moreActive = MORE.some(item => pathname === item.href)
  const activeMoreItem = MORE.find(item => pathname === item.href)

  return (
    <>
      {/* ── More overlay ── */}
      {showMore && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setShowMore(false)}
            style={{
              background: 'rgba(0,0,0,0.28)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          />
          <div
            className="fixed left-0 right-0 z-40 sm:hidden"
            style={{
              bottom: `calc(56px + env(safe-area-inset-bottom))`,
              background: 'rgba(250,250,252,0.97)',
              backdropFilter: 'blur(28px) saturate(180%)',
              WebkitBackdropFilter: 'blur(28px) saturate(180%)',
              borderRadius: '22px 22px 0 0',
              boxShadow: '0 -4px 40px rgba(0,0,0,0.13)',
              overflow: 'hidden',
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(60,60,67,0.18)' }} />
            </div>

            {/* Label */}
            <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(60,60,67,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center', padding: '4px 0 12px' }}>
              Mehr
            </p>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0, padding: '0 8px 16px' }}>
              {MORE.map(item => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{ textDecoration: 'none' }}
                  >
                    <div
                      className="pressable"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 5,
                        padding: '12px 4px',
                        borderRadius: 16,
                        background: active ? 'rgba(217,119,6,0.08)' : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 24 }}>{item.emoji}</span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: active ? 700 : 500,
                        color: active ? '#D97706' : 'rgba(60,60,67,0.55)',
                        letterSpacing: '-0.01em',
                        textAlign: 'center',
                      }}>
                        {item.label}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Tab bar ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-20 sm:hidden"
        style={{
          background: 'rgba(250,250,252,0.92)',
          backdropFilter: 'blur(24px) saturate(200%)',
          WebkitBackdropFilter: 'blur(24px) saturate(200%)',
          borderTop: '0.5px solid rgba(60,60,67,0.11)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div style={{ display: 'flex', height: 56 }}>

          {/* Primary tabs */}
          {PRIMARY.map(item => {
            const active = (item.match ?? [item.href]).some(p => pathname === p)
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  textDecoration: 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{
                  padding: '3px 12px',
                  borderRadius: 9,
                  background: active ? 'rgba(217,119,6,0.1)' : 'transparent',
                  transition: 'background 0.2s ease',
                  fontSize: 20,
                  lineHeight: 1,
                  opacity: active ? 1 : 0.58,
                }}>
                  {item.emoji}
                </div>
                <span style={{
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  color: active ? '#D97706' : 'rgba(60,60,67,0.48)',
                  transition: 'color 0.2s ease',
                  letterSpacing: '-0.01em',
                }}>
                  {item.label}
                </span>
              </Link>
            )
          })}

          {/* Mehr tab */}
          <button
            onClick={() => setShowMore(v => !v)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{
              padding: '3px 12px',
              borderRadius: 9,
              background: (showMore || moreActive) ? 'rgba(217,119,6,0.1)' : 'transparent',
              transition: 'background 0.2s ease',
              fontSize: 20,
              lineHeight: 1,
              opacity: (showMore || moreActive) ? 1 : 0.58,
            }}>
              {moreActive && !showMore ? activeMoreItem?.emoji : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="rgba(60,60,67,0.7)">
                  <circle cx="4" cy="7" r="1.6" />
                  <circle cx="10" cy="7" r="1.6" />
                  <circle cx="16" cy="7" r="1.6" />
                  <circle cx="4" cy="13" r="1.6" />
                  <circle cx="10" cy="13" r="1.6" />
                  <circle cx="16" cy="13" r="1.6" />
                </svg>
              )}
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: (showMore || moreActive) ? 700 : 500,
              color: (showMore || moreActive) ? '#D97706' : 'rgba(60,60,67,0.48)',
              transition: 'color 0.2s ease',
              letterSpacing: '-0.01em',
            }}>
              {moreActive && !showMore ? activeMoreItem?.label : 'Mehr'}
            </span>
          </button>

        </div>
      </nav>
    </>
  )
}

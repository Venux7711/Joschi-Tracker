'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', icon: '⊞', emoji: '🏠', label: 'Heute' },
  { href: '/fotos', emoji: '📸', label: 'Fotos', match: ['/fotos', '/slideshow'] },
  { href: '/collage', emoji: '🗓️', label: 'Woche' },
  { href: '/gewicht', emoji: '⚖️', label: 'Gewicht' },
  { href: '/medikamente', emoji: '💊', label: 'Medis' },
]

export default function BottomNav() {
  const pathname = usePathname()

  const hidden = ['/login', '/auth', '/wrapped', '/slideshow'].some(p => pathname.startsWith(p))
  if (hidden) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 sm:hidden"
      style={{
        background: 'rgba(249, 249, 251, 0.88)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderTop: '0.5px solid rgba(60, 60, 67, 0.12)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div style={{ display: 'flex', height: 56 }}>
        {NAV.map(item => {
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
                transition: 'opacity 0.15s',
              }}
            >
              {/* Icon container with active pill */}
              <div
                style={{
                  padding: '4px 14px',
                  borderRadius: 10,
                  background: active ? 'rgba(217, 119, 6, 0.1)' : 'transparent',
                  transition: 'all 0.2s',
                  fontSize: 20,
                  lineHeight: 1,
                  filter: active ? 'none' : 'grayscale(40%)',
                  opacity: active ? 1 : 0.65,
                }}
              >
                {item.emoji}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  letterSpacing: '-0.01em',
                  color: active ? '#D97706' : 'rgba(60, 60, 67, 0.5)',
                  transition: 'color 0.2s',
                }}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

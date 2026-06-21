'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navItems = [
    { href: '/dashboard', label: 'Heute' },
    { href: '/history', label: 'Verlauf' },
    { href: '/pantry', label: 'Vorrat' },
    { href: '/fotos', label: 'Fotos', match: ['/fotos', '/slideshow'] },
    { href: '/collage', label: 'Woche' },
    { href: '/gewicht', label: 'Gewicht' },
    { href: '/medikamente', label: 'Medis' },
    { href: '/report', label: 'Report' },
    { href: '/wrapped', label: '🎁' },
  ]

  return (
    <header
      className="sticky top-0 z-10"
      style={{
        background: 'rgba(242, 242, 247, 0.82)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '0.5px solid rgba(60, 60, 67, 0.12)',
      }}
    >
      <div className="max-w-2xl mx-auto px-4 flex items-center justify-between" style={{ height: 52 }}>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div
            className="relative flex-shrink-0 overflow-hidden"
            style={{ width: 32, height: 32, borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
          >
            <Image src="/joschi.jpg" alt="Joschi" fill className="object-cover object-top" />
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: '#1C1C1E' }}>
            Joschi
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-0.5">
          {navItems.map(item => {
            const active = (item.match ?? [item.href]).some(p => pathname === p)
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  color: active ? '#D97706' : 'rgba(60,60,67,0.6)',
                  background: active ? 'rgba(217,119,6,0.08)' : 'transparent',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.01em',
                }}
              >
                {item.label}
              </Link>
            )
          })}
          <button
            onClick={handleSignOut}
            style={{
              marginLeft: 4,
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              color: 'rgba(60,60,67,0.4)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            Abmelden
          </button>
        </nav>

        {/* Mobile logout */}
        <button
          onClick={handleSignOut}
          className="sm:hidden"
          style={{
            padding: 8,
            borderRadius: 10,
            background: 'transparent',
            border: 'none',
            color: 'rgba(60,60,67,0.4)',
            cursor: 'pointer',
          }}
          aria-label="Abmelden"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
          </svg>
        </button>
      </div>
    </header>
  )
}

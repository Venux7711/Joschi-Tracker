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
    <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
          <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-amber-300">
            <Image src="/joschi.jpg" alt="Joschi" fill className="object-cover object-top" />
          </div>
          <span className="font-semibold text-gray-800 text-lg">Joschi</span>
        </Link>

        {/* Desktop nav – hidden on mobile, bottom nav takes over */}
        <nav className="hidden sm:flex items-center gap-1 overflow-x-auto">
          {navItems.map(item => {
            const active = (item.match ?? [item.href]).some(p => pathname === p)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors whitespace-nowrap"
          >
            Abmelden
          </button>
        </nav>

        {/* Mobile: just logout icon */}
        <button
          onClick={handleSignOut}
          className="sm:hidden text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Abmelden"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
          </svg>
        </button>
      </div>
    </header>
  )
}

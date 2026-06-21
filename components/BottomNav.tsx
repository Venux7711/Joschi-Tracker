'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', icon: '🏠', label: 'Heute' },
  { href: '/fotos', icon: '📸', label: 'Fotos', match: ['/fotos', '/slideshow'] },
  { href: '/collage', icon: '🗓️', label: 'Woche' },
  { href: '/gewicht', icon: '⚖️', label: 'Gewicht' },
  { href: '/medikamente', icon: '💊', label: 'Medis' },
]

export default function BottomNav() {
  const pathname = usePathname()

  // Don't show on login, auth, wrapped (full-screen), slideshow
  const hidden = ['/login', '/auth', '/wrapped', '/slideshow'].some(p => pathname.startsWith(p))
  if (hidden) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-20 sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch h-14">
        {NAV.map(item => {
          const active = (item.match ?? [item.href]).some(p => pathname === p)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-amber-600' : 'text-gray-400'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-amber-500 rounded-full" />
              )}
              <span className="text-[20px] leading-none">{item.icon}</span>
              <span className={`text-[10px] font-medium leading-none ${active ? 'text-amber-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

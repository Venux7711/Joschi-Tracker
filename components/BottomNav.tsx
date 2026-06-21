'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', icon: '🏠', label: 'Heute' },
  { href: '/fotos', icon: '📸', label: 'Fotos' },
  { href: '/collage', icon: '🗓️', label: 'Woche' },
  { href: '/pantry', icon: '📦', label: 'Vorrat' },
  { href: '/wrapped', icon: '🎁', label: 'Wrapped' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-20 sm:hidden safe-area-pb">
      <div className="flex items-stretch">
        {NAV.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                active ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className={`text-[10px] font-medium ${active ? 'text-amber-600' : 'text-gray-400'}`}>{item.label}</span>
              {active && <span className="absolute bottom-0 w-8 h-0.5 bg-amber-500 rounded-full" />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

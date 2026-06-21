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

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-amber-300 flex-shrink-0">
            <Image src="/joschi.jpg" alt="Joschi" fill className="object-cover object-top" />
          </div>
          <span className="font-semibold text-gray-800 text-lg">Joschi</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/dashboard"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/dashboard'
                ? 'bg-amber-100 text-amber-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            Heute
          </Link>
          <Link
            href="/history"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/history'
                ? 'bg-amber-100 text-amber-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            Verlauf
          </Link>
          <Link
            href="/pantry"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/pantry'
                ? 'bg-amber-100 text-amber-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            Vorrat
          </Link>
          <Link
            href="/fotos"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/fotos' || pathname === '/slideshow'
                ? 'bg-amber-100 text-amber-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            Fotos
          </Link>
          <Link
            href="/collage"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/collage'
                ? 'bg-amber-100 text-amber-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            Woche
          </Link>
          <Link
            href="/report"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/report'
                ? 'bg-amber-100 text-amber-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            Report
          </Link>
          <Link
            href="/wrapped"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/wrapped'
                ? 'bg-amber-100 text-amber-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            🎁
          </Link>
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Abmelden
          </button>
        </nav>
      </div>
    </header>
  )
}

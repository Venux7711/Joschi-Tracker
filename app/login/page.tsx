'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Falsche E-Mail oder falsches Passwort.')
      setLoading(false)
      return
    }

    // Einmalpasswort gesetzt → Passwort ändern erzwingen
    if (data.user?.user_metadata?.must_change_password) {
      router.refresh()
      router.push('/auth/change-password')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-amber-300 shadow-md mx-auto mb-3">
            <Image src="/joschi.jpg" alt="Joschi" fill className="object-cover object-top" priority />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Joschi Tracker</h1>
          <p className="text-gray-500 text-sm mt-1">Gesundheitstracker für Joschi</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="deine@email.de"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Passwort
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-2"
          >
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <div className="text-center mt-4">
          <Link
            href="/auth/forgot-password"
            className="text-sm text-amber-600 hover:text-amber-700 underline"
          >
            Passwort vergessen?
          </Link>
        </div>
      </div>
    </div>
  )
}

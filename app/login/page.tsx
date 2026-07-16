'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

    if (data.user?.user_metadata?.must_change_password) {
      router.refresh()
      router.push('/auth/change-password')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(160deg, #F2F2F7 0%, #FEF3C7 100%)' }}
    >
      {/* Logo block */}
      <div className="text-center mb-10">
        <div
          className="relative mx-auto mb-5 flex items-center justify-center"
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            border: '3px solid rgba(255,255,255,0.8)',
            background: 'linear-gradient(145deg, #FBBF24 0%, #D97706 100%)',
            fontSize: 44,
          }}
        >
          🐾
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: '#1C1C1E' }}>
          Tracker
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(60,60,67,0.5)', marginTop: 4, letterSpacing: '-0.01em' }}>
          Gesundheitstracker
        </p>
      </div>

      {/* Card */}
      <div
        className="w-full"
        style={{
          maxWidth: 360,
          background: 'rgba(255,255,255,0.92)',
          borderRadius: 24,
          padding: '28px 24px 24px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">E-Mail</label>
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
            <label htmlFor="password" className="label">Passwort</label>
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
            <div
              style={{
                background: 'rgba(220,38,38,0.08)',
                borderRadius: 12,
                padding: '12px 14px',
                fontSize: 13,
                color: '#DC2626',
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: 8 }}>
            {loading ? 'Anmelden…' : 'Anmelden'}
          </button>
        </form>

        <div className="text-center mt-5">
          <Link
            href="/auth/forgot-password"
            style={{ fontSize: 13, color: '#D97706', fontWeight: 500 }}
          >
            Passwort vergessen?
          </Link>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { birthdayInfo } from '@/lib/birthday'
import { formatBerlin } from '@/lib/time'
import AbsenceSettings from '@/components/AbsenceSettings'
import PushSettings from '@/components/PushSettings'
import TelegramSettings from '@/components/TelegramSettings'
import type { Cat } from '@/lib/types'

export default function EinstellungenPage() {
  const supabase = createClient()
  const [cats, setCats] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('cats').select('*').order('created_at', { ascending: true })
      setCats((data ?? []) as Cat[])
      setLoading(false)
    }
    load()
  }, [])

  const saveBirthday = async (id: string, birthday: string) => {
    setSavingId(id)
    setError(null)
    setSavedId(null)

    const res = await fetch('/api/cats', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, birthday: birthday || null }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingId(null)

    if (!res.ok) {
      setError(data.error ?? 'Konnte nicht gespeichert werden')
      return
    }
    setCats(prev => prev.map(c => (c.id === id ? { ...c, birthday: birthday || null } : c)))
    setSavedId(id)
    setTimeout(() => setSavedId(null), 2000)
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">← Zurück</Link>
          <h1 className="text-xl font-bold text-gray-800">⚙️ Einstellungen</h1>
        </div>

        <div className="card overflow-hidden">
          <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Geburtstage</h2>
            <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 2 }}>
              Am Geburtstag und am Tag danach zeigt das Dashboard eine Überraschung
            </p>
          </div>

          {loading ? (
            <div style={{ padding: '24px 20px' }}>
              <div className="h-5 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : (
            <div>
              {cats.map((cat, i) => {
                const info = birthdayInfo(cat.birthday)
                return (
                  <div
                    key={cat.id}
                    style={{ padding: '14px 20px', ...(i > 0 ? { borderTop: '0.5px solid rgba(60,60,67,0.07)' } : {}) }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1C1C1E' }}>🐾 {cat.name}</span>
                      {savingId === cat.id && <span className="text-xs text-gray-400">speichert…</span>}
                      {savedId === cat.id && <span className="text-xs text-green-600 font-medium">gespeichert ✓</span>}
                    </div>

                    <input
                      type="date"
                      value={cat.birthday ?? ''}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={e => saveBirthday(cat.id, e.target.value)}
                      className="input-field"
                    />

                    {info && (
                      <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)', marginTop: 6 }}>
                        {formatBerlin(`${cat.birthday}T12:00:00`, { day: 'numeric', month: 'long', year: 'numeric' })}
                        {' · '}
                        {info.currentAge} {info.currentAge === 1 ? 'Jahr' : 'Jahre'} alt
                        {info.isToday
                          ? ' · 🎉 heute Geburtstag!'
                          : info.daysUntil > 0
                            ? ` · in ${info.daysUntil} ${info.daysUntil === 1 ? 'Tag' : 'Tagen'} wird ${cat.name} ${info.age}`
                            : ''}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 20px' }}>
              <p className="text-sm text-red-600">⚠ {error}</p>
            </div>
          )}
        </div>

        <AbsenceSettings />

        <PushSettings />

        <details>
          <summary style={{ fontSize: 13, color: 'rgba(60,60,67,0.45)', cursor: 'pointer', padding: '4px 2px' }}>
            Telegram als zusätzlicher Weg (optional)
          </summary>
          <div className="mt-3">
            <TelegramSettings />
          </div>
        </details>
      </main>
    </div>
  )
}

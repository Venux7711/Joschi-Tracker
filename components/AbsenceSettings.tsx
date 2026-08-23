'use client'

import { useEffect, useState } from 'react'
import { formatBerlin, fromBerlinInputValue } from '@/lib/time'

type Absence = {
  id: string
  starts_on: string
  ends_on: string
  label: string | null
}

/**
 * Betreuungszeiträume pflegen.
 *
 * In dieser Zeit sind die Katzen nicht zuhause und jemand anderes füttert.
 * Die Futterempfehlung schlägt dann nichts Unerprobtes mehr vor und meidet
 * Sorten, die zuletzt Beschwerden gemacht haben.
 */
export default function AbsenceSettings() {
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/absences')
    const data = await res.json().catch(() => ({}))
    if (res.ok) setAbsences(data.absences ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const anlegen = async () => {
    setBusy(true); setError(null)
    const res = await fetch('/api/absences', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starts_on: von, ends_on: bis, label }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Konnte nicht gespeichert werden'); return }
    setVon(''); setBis(''); setLabel('')
    load()
  }

  const loeschen = async (a: Absence) => {
    if (!confirm('Zeitraum entfernen?')) return
    const res = await fetch('/api/absences', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }),
    })
    if (res.ok) setAbsences(prev => prev.filter(x => x.id !== a.id))
    else setError('Konnte nicht entfernt werden')
  }

  const tage = (a: Absence) => {
    const von = new Date(`${a.starts_on}T12:00:00Z`).getTime()
    const bis = new Date(`${a.ends_on}T12:00:00Z`).getTime()
    return Math.round((bis - von) / 86_400_000) + 1
  }

  const heute = new Date().toISOString().slice(0, 10)

  return (
    <div className="card overflow-hidden">
      <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>
          Betreuung
        </h2>
        <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 2 }}>
          Wenn die Katzen nicht zuhause sind, empfiehlt die App nur Bewährtes
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '24px 20px' }}><div className="h-5 bg-gray-100 rounded animate-pulse" /></div>
      ) : (
        <div>
          {absences.map((a, i) => {
            const laeuft = a.starts_on <= heute && a.ends_on >= heute
            const vorbei = a.ends_on < heute
            return (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3"
                style={{ padding: '13px 20px', ...(i > 0 ? { borderTop: '0.5px solid rgba(60,60,67,0.07)' } : {}), opacity: vorbei ? 0.5 : 1 }}
              >
                <div className="min-w-0">
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1E' }}>
                    {laeuft ? '🏠 ' : ''}{a.label ?? 'Betreuung'}
                  </p>
                  <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)' }}>
                    {formatBerlin(fromBerlinInputValue(a.starts_on), { day: 'numeric', month: 'long' })}
                    {' bis '}
                    {formatBerlin(fromBerlinInputValue(a.ends_on), { day: 'numeric', month: 'long', year: 'numeric' })}
                    {' · '}{tage(a)} Tage
                    {laeuft ? ' · läuft' : vorbei ? ' · vorbei' : ''}
                  </p>
                </div>
                <button onClick={() => loeschen(a)} className="text-xs text-red-400 flex-shrink-0">Entfernen</button>
              </div>
            )
          })}

          <div style={{ padding: '14px 20px', borderTop: '0.5px solid rgba(60,60,67,0.07)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(60,60,67,0.4)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
              Zeitraum hinzufügen
            </p>
            <div className="flex gap-2">
              <input type="date" value={von} onChange={e => setVon(e.target.value)} className="input-field" aria-label="Von" />
              <input type="date" value={bis} onChange={e => setBis(e.target.value)} className="input-field" aria-label="Bis" />
            </div>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="z.B. Betreuung bei Marion"
              className="input-field mt-2"
              maxLength={80}
            />
            <button onClick={anlegen} disabled={!von || !bis || busy} className="btn-primary mt-3">
              {busy ? 'Speichert…' : 'Hinzufügen'}
            </button>
          </div>

          {error && (
            <div style={{ padding: '0 20px 16px' }}>
              <p className="text-sm text-red-600">⚠ {error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

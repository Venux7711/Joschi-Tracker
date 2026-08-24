'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBerlin, fromBerlinInputValue } from '@/lib/time'

type Absence = {
  id: string
  starts_on: string
  ends_on: string
  label: string | null
}

type VorratsSorte = { brand: string; type: string; quantity: number; size_grams: number | null }
type Proviant = { brand: string; type: string; quantity: number; size_grams: number | null }

const key = (s: { brand: string; type: string }) => `${s.brand}||${s.type}`

/**
 * Betreuungszeiträume pflegen.
 *
 * In dieser Zeit sind die Katzen nicht zuhause und jemand anderes füttert.
 * Die Futterempfehlung schlägt dann nichts Unerprobtes mehr vor und meidet
 * Sorten, die zuletzt Beschwerden gemacht haben.
 */
export default function AbsenceSettings() {
  const supabase = createClient()
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Proviant für den laufenden bzw. nächsten Zeitraum
  const [vorrat, setVorrat] = useState<VorratsSorte[]>([])
  const [mengen, setMengen] = useState<Record<string, number>>({})
  const [proviantFuer, setProviantFuer] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const [gespeichert, setGespeichert] = useState(false)

  const load = async () => {
    const res = await fetch('/api/absences')
    const data = await res.json().catch(() => ({}))
    if (res.ok) setAbsences(data.absences ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const heute = new Date().toISOString().slice(0, 10)

  // Der Zeitraum, um den es beim Proviant geht: der laufende, sonst der nächste.
  // absences kommt absteigend nach Startdatum – der passende ist der letzte,
  // der noch nicht vorbei ist.
  const aktueller = [...absences].reverse().find(a => a.ends_on >= heute) ?? null

  useEffect(() => {
    if (!aktueller) return
    const laden = async () => {
      const [{ data: pantryRows }, res] = await Promise.all([
        supabase.from('pantry_items').select('brand, type, quantity, size_grams').gt('quantity', 0),
        fetch(`/api/absences/supplies?absenceId=${aktueller.id}`),
      ])

      // Sorten aus dem Vorrat zusammenfassen: Der Vorrat liegt pro Katze vor,
      // eingepackt wird aber die Dose, nicht die Katzen-Zuordnung.
      const summiert = new Map<string, VorratsSorte>()
      for (const p of (pantryRows ?? []) as VorratsSorte[]) {
        const k = key(p)
        const vorhanden = summiert.get(k)
        if (vorhanden) vorhanden.quantity += p.quantity
        else summiert.set(k, { ...p })
      }

      const daten = await res.json().catch(() => ({}))
      const gespeicherterProviant: Proviant[] = res.ok ? daten.supplies ?? [] : []

      // Auch Sorten anzeigen, die eingepackt sind, aber im Vorrat fehlen –
      // sonst verschwände eine gebuchte Dose stillschweigend aus der Liste.
      for (const s of gespeicherterProviant) {
        if (!summiert.has(key(s))) {
          summiert.set(key(s), { brand: s.brand, type: s.type, quantity: 0, size_grams: s.size_grams })
        }
      }

      setVorrat([...summiert.values()].sort((a, b) => a.type.localeCompare(b.type)))
      setMengen(Object.fromEntries(gespeicherterProviant.map(s => [key(s), s.quantity])))
      setProviantFuer(aktueller.id)
    }
    laden()
  }, [aktueller?.id])

  const setzeMenge = (s: VorratsSorte, wert: number) => {
    setGespeichert(false)
    setMengen(prev => ({ ...prev, [key(s)]: Math.max(0, wert) }))
  }

  const speichereProviant = async () => {
    if (!aktueller) return
    setSpeichert(true); setError(null)
    const res = await fetch('/api/absences/supplies', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        absenceId: aktueller.id,
        supplies: vorrat
          .map(s => ({ brand: s.brand, type: s.type, quantity: mengen[key(s)] ?? 0, size_grams: s.size_grams }))
          .filter(s => s.quantity > 0),
      }),
    })
    setSpeichert(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Proviant konnte nicht gespeichert werden')
      return
    }
    setGespeichert(true)
    setTimeout(() => setGespeichert(false), 2500)
  }

  const dosenDabei = Object.values(mengen).reduce((s, n) => s + n, 0)

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

          {/* ── PROVIANT ──
              Der Vorrat in der App ist der Bestand des Haushalts. Mit auf die
              Reise geht nur ein Teil davon. Ohne diese Angabe empfiehlt das
              Dashboard Dosen, die zuhause im Regal stehen. */}
          {aktueller && proviantFuer === aktueller.id && (
            <div style={{ padding: '14px 20px', borderTop: '0.5px solid rgba(60,60,67,0.07)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(60,60,67,0.4)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Proviant · {aktueller.label ?? 'Betreuung'}
              </p>
              <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)', marginTop: 3, marginBottom: 10 }}>
                Welche Dosen sind dabei? Solange hier nichts steht, empfiehlt das
                Dashboard aus dem gesamten Vorrat – auch aus dem, was zuhause bleibt.
              </p>

              {vorrat.length === 0 ? (
                <p style={{ fontSize: 13, color: 'rgba(60,60,67,0.5)' }}>Der Vorrat ist leer.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {vorrat.map(s => {
                    const menge = mengen[key(s)] ?? 0
                    return (
                      <div key={key(s)} className="flex items-center justify-between gap-3" style={{ padding: '7px 0' }}>
                        <div className="min-w-0">
                          <p style={{ fontSize: 14, color: menge > 0 ? '#1C1C1E' : 'rgba(60,60,67,0.55)', fontWeight: menge > 0 ? 600 : 400 }} className="truncate">
                            {s.type}
                          </p>
                          <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.4)' }}>
                            {s.quantity} im Vorrat{s.size_grams ? ` · ${s.size_grams} g` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => setzeMenge(s, menge - 1)}
                            disabled={menge === 0}
                            aria-label={`Eine Dose ${s.type} weniger`}
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(60,60,67,0.07)', color: '#3C3C43', fontSize: 18, opacity: menge === 0 ? 0.35 : 1 }}
                          >
                            −
                          </button>
                          <span style={{ fontSize: 15, fontWeight: 700, minWidth: 18, textAlign: 'center', color: menge > 0 ? 'var(--am-600)' : 'rgba(60,60,67,0.3)' }} className="tabular-nums">
                            {menge}
                          </span>
                          <button
                            onClick={() => setzeMenge(s, menge + 1)}
                            aria-label={`Eine Dose ${s.type} mehr`}
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(60,60,67,0.07)', color: '#3C3C43', fontSize: 18 }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex items-center gap-3 mt-3">
                <button onClick={speichereProviant} disabled={speichert} className="btn-primary">
                  {speichert ? 'Speichert…' : 'Proviant speichern'}
                </button>
                <span style={{ fontSize: 12, color: gespeichert ? '#15803D' : 'rgba(60,60,67,0.45)', fontWeight: gespeichert ? 600 : 400 }}>
                  {gespeichert
                    ? 'gespeichert ✓'
                    : dosenDabei > 0
                      ? `${dosenDabei} ${dosenDabei === 1 ? 'Dose' : 'Dosen'} dabei`
                      : 'nichts ausgewählt'}
                </span>
              </div>
            </div>
          )}

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

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { formatBerlin } from '@/lib/time'

/**
 * Was die App über Joschi und Bella weiß.
 *
 * Zwei Zwecke. Erstens Nachvollziehbarkeit: Wenn ein Gedanke behauptet, Bella
 * sei „schon wieder" am Fenster gewesen, muss man nachsehen können, worauf das
 * beruht. Zweitens Korrektur – der Mensch sieht seine Katzen jeden Tag, das
 * Modell sieht drei Fotos.
 *
 * Bewusst keine Diagramme und keine Prozentbalken. Es ist kein Messgerät,
 * sondern eine Sammlung von Beobachtungen, und so soll es auch aussehen.
 */

type Erinnerung = {
  id: string
  wer: string
  subjectType: 'cat' | 'pair' | 'household'
  art: string
  titel: string
  beschreibung: string | null
  anzahl: number
  zuversicht: number
  status: string
  quelle: 'beobachtung' | 'nutzer'
  seit: string
  zuletzt: string
}

const ART_LABEL: Record<string, string> = {
  milestone: 'Meilenstein',
  event: 'Ereignis',
  running_gag: 'Wiederkehrendes Thema',
  relationship: 'Beziehung',
  preference: 'Vorliebe',
  pattern: 'Muster',
  temporal_pattern: 'Zeitliches Muster',
  observation: 'Beobachtung',
  fact: 'Fakt',
}

/** Die Reihenfolge, in der Gruppen erscheinen – Wichtigstes zuerst. */
const ART_RANG = ['milestone', 'event', 'running_gag', 'relationship', 'preference', 'pattern', 'temporal_pattern', 'observation', 'fact']

export default function GedaechtnisSeite() {
  const [erinnerungen, setErinnerungen] = useState<Erinnerung[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [bearbeitet, setBearbeitet] = useState<string | null>(null)
  const [entwurf, setEntwurf] = useState('')

  const laden = () => {
    setFehler(null)
    fetch('/api/memory')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setErinnerungen(d.erinnerungen ?? []))
      .catch(() => setFehler('Konnte nicht geladen werden.'))
  }

  useEffect(laden, [])

  /** Aus der vorhandenen Historie ableiten, was ableitbar ist. */
  const ableiten = async () => {
    setBusy(true); setMeldung(null)
    try {
      const res = await fetch('/api/memory', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setMeldung(
        d.geschrieben > 0
          ? `${d.geschrieben} Erinnerungen aus der Historie übernommen.`
          : 'Nichts Neues – die Historie ist bereits ausgewertet.',
      )
      laden()
    } catch {
      setMeldung('Das Ableiten hat nicht geklappt.')
    }
    setBusy(false)
  }

  const speichern = async (id: string) => {
    const text = entwurf.trim()
    if (!text) return
    setBusy(true)
    const res = await fetch('/api/memory', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, beschreibung: text }),
    })
    setBusy(false)
    if (res.ok) { setBearbeitet(null); setEntwurf(''); laden() }
    else setMeldung('Konnte nicht gespeichert werden.')
  }

  const verwerfen = async (e: Erinnerung) => {
    if (!confirm(`„${e.beschreibung ?? e.titel}" verwerfen? Sie fließt dann in keinen Gedanken mehr ein.`)) return
    setBusy(true)
    const res = await fetch('/api/memory', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: e.id, verwerfen: true }),
    })
    setBusy(false)
    if (res.ok) laden()
    else setMeldung('Konnte nicht verworfen werden.')
  }

  const gruppen = (() => {
    if (!erinnerungen) return []
    const nach = new Map<string, Erinnerung[]>()
    for (const e of erinnerungen) {
      const liste = nach.get(e.wer) ?? []
      liste.push(e)
      nach.set(e.wer, liste)
    }
    for (const liste of nach.values()) {
      liste.sort((a, b) =>
        ART_RANG.indexOf(a.art) - ART_RANG.indexOf(b.art) || b.anzahl - a.anzahl)
    }
    return [...nach.entries()]
  })()

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">← Zurück</Link>
          <h1 className="text-xl font-bold text-gray-800">🧠 Was die App weiß</h1>
        </div>

        {/* Steht schon etwas da, gehört der Einleitungstext nicht mehr nach
            oben – dann will man die Erinnerungen sehen, nicht die Erklärung. */}
        <p style={{ fontSize: 13, color: 'rgba(60,60,67,0.55)', lineHeight: 1.55 }}>
          Alles hier ist aus euren eigenen Daten beobachtet – aus Fotos, Orten und
          Fütterungen. Nichts davon ist ausgedacht. Was nicht stimmt, könnt ihr
          richtigstellen; eine Korrektur wiegt danach schwerer als jede weitere
          Beobachtung.
        </p>

        {erinnerungen && erinnerungen.length === 0 && (
          <div className="card" style={{ padding: '14px 18px' }}>
            <button onClick={ableiten} disabled={busy} className="btn-primary">
              {busy ? 'Wertet aus…' : 'Historie auswerten'}
            </button>
            {meldung && (
              <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.55)', marginTop: 8 }}>{meldung}</p>
            )}
          </div>
        )}

        {fehler && (
          <div className="card" style={{ padding: '14px 18px' }}>
            <p className="text-sm text-red-600">⚠ {fehler}</p>
            <button onClick={laden} className="text-xs mt-2" style={{ textDecoration: 'underline' }}>
              Nochmal versuchen
            </button>
          </div>
        )}

        {!erinnerungen && !fehler && (
          <div className="card" style={{ padding: '20px' }}>
            <div className="h-4 bg-gray-100 rounded animate-pulse mb-2" style={{ width: '70%' }} />
            <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '45%' }} />
          </div>
        )}

        {erinnerungen?.length === 0 && (
          <div className="card p-10 text-center">
            <div className="text-4xl mb-3">🧠</div>
            <p className="text-gray-500 mb-1">Noch nichts gelernt</p>
            <p className="text-sm text-gray-400">
              Tippe oben auf „Historie auswerten" – aus den vorhandenen Fotos und
              Fütterungen lässt sich schon einiges ableiten.
            </p>
          </div>
        )}

        {gruppen.map(([wer, liste]) => (
          <div key={wer} className="card overflow-hidden">
            <div style={{ padding: '14px 18px 10px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1C1C1E' }}>
                {wer === 'Beide' ? '🐾 Beide zusammen' : wer === 'Zuhause' ? '🏠 Zuhause' : `🐱 ${wer}`}
              </h2>
              <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.4)' }}>
                {liste.length} {liste.length === 1 ? 'Erinnerung' : 'Erinnerungen'}
              </p>
            </div>

            <div>
              {liste.map((e, i) => (
                <div
                  key={e.id}
                  style={{ padding: '12px 18px', ...(i > 0 ? { borderTop: '0.5px solid rgba(60,60,67,0.06)' } : {}) }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                          background: 'rgba(60,60,67,0.07)', color: 'rgba(60,60,67,0.55)',
                        }}>
                          {ART_LABEL[e.art] ?? e.art}
                        </span>
                        {e.quelle === 'nutzer' && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                            background: 'rgba(21,104,63,0.1)', color: '#15683F',
                          }}>
                            von euch bestätigt
                          </span>
                        )}
                        {e.status === 'tentative' && (
                          <span style={{ fontSize: 10, color: 'rgba(60,60,67,0.4)' }}>
                            noch unsicher
                          </span>
                        )}
                      </div>

                      <p style={{ fontSize: 14, color: '#1C1C1E', lineHeight: 1.4 }}>
                        {e.beschreibung ?? e.titel}
                      </p>

                      {/* Der Beleg. Ohne ihn wäre es eine Behauptung. */}
                      <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.42)', marginTop: 3 }}>
                        {e.anzahl}× beobachtet
                        {e.seit !== e.zuletzt && (
                          <> · {formatBerlin(`${e.seit}T12:00:00`, { day: 'numeric', month: 'short' })}
                            {' bis '}
                            {formatBerlin(`${e.zuletzt}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })}</>
                        )}
                        {e.seit === e.zuletzt && (
                          <> · {formatBerlin(`${e.seit}T12:00:00`, { day: 'numeric', month: 'long', year: 'numeric' })}</>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1 flex-shrink-0 items-end">
                      <button
                        onClick={() => { setBearbeitet(e.id); setEntwurf(e.beschreibung ?? e.titel) }}
                        style={{ fontSize: 11, color: 'rgba(60,60,67,0.5)' }}
                      >
                        Richtigstellen
                      </button>
                      <button
                        onClick={() => verwerfen(e)}
                        style={{ fontSize: 11, color: 'rgba(163,58,30,0.65)' }}
                      >
                        Stimmt nicht
                      </button>
                    </div>
                  </div>

                  {bearbeitet === e.id && (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={entwurf}
                        onChange={ev => setEntwurf(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === 'Enter') speichern(e.id) }}
                        maxLength={300}
                        className="input-field"
                        autoFocus
                      />
                      <button onClick={() => speichern(e.id)} disabled={busy} className="btn-primary flex-shrink-0">
                        Speichern
                      </button>
                      <button
                        onClick={() => { setBearbeitet(null); setEntwurf('') }}
                        style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)' }}
                        className="flex-shrink-0"
                      >
                        Abbrechen
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Neu auswerten gehört ans Ende: Es ist Wartung, nicht der Zweck
            der Seite. Neue Fotos und Fütterungen kommen dadurch hinzu. */}
        {erinnerungen && erinnerungen.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap" style={{ paddingBottom: 8 }}>
            <button
              onClick={ableiten}
              disabled={busy}
              style={{
                fontSize: 12, fontWeight: 600, padding: '7px 13px', borderRadius: 9,
                border: 'none', background: 'rgba(60,60,67,0.06)', color: 'rgba(60,60,67,0.6)',
              }}
            >
              {busy ? 'Wertet aus…' : 'Historie erneut auswerten'}
            </button>
            {meldung && (
              <span style={{ fontSize: 12, color: 'rgba(60,60,67,0.5)' }}>{meldung}</span>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

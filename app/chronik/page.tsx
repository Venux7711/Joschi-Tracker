'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import { formatBerlin } from '@/lib/time'

/**
 * Unsere Geschichte.
 *
 * Nur Ereignisse mit Datum – keine Muster, keine Statistik. Ein „liegt oft auf
 * dem Sofa" hat keinen Zeitpunkt und gehört deshalb nicht hierher. Diese
 * Strenge ist der ganze Trick: Sonst wird aus der Zeitleiste ein
 * Datenfriedhof, durch den niemand scrollt.
 *
 * Heute sind das eine Handvoll Punkte. In einem Jahr ist es eine Chronik.
 */

type Punkt = {
  id: string
  tag: string
  titel: string
  wer: string | null
  art: 'geburt' | 'meilenstein' | 'ereignis' | 'betreuung'
  fotoUrl: string | null
  fotoId: string | null
  bis: string | null
}

const ZEICHEN: Record<Punkt['art'], string> = {
  geburt: '🎂',
  meilenstein: '⭐',
  ereignis: '📍',
  betreuung: '🏠',
}

const FARBE: Record<Punkt['art'], string> = {
  geburt: '#B45309',
  meilenstein: '#B45309',
  ereignis: '#55636D',
  betreuung: '#6B5B8A',
}

export default function ChronikSeite() {
  const [punkte, setPunkte] = useState<Punkt[] | null>(null)
  const [fehler, setFehler] = useState(false)

  const laden = () => {
    setFehler(false)
    fetch('/api/chronik')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setPunkte(d.punkte ?? []))
      .catch(() => setFehler(true))
  }

  useEffect(laden, [])

  // Nach Jahr gruppieren – bei einem halben Jahr Daten ist das noch ruhig,
  // in zwei Jahren gibt es der Seite Halt.
  const jahre = (() => {
    if (!punkte) return []
    const nach = new Map<string, Punkt[]>()
    for (const p of punkte) {
      const jahr = p.tag.slice(0, 4)
      nach.set(jahr, [...(nach.get(jahr) ?? []), p])
    }
    return [...nach.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  })()

  const datum = (tag: string) =>
    formatBerlin(`${tag}T12:00:00`, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">← Zurück</Link>
          <h1 className="text-xl font-bold text-gray-800">🐾 Unsere Geschichte</h1>
        </div>

        {fehler && (
          <div className="card" style={{ padding: '14px 18px' }}>
            <p className="text-sm text-red-600">⚠ Konnte nicht geladen werden.</p>
            <button onClick={laden} className="text-xs mt-2" style={{ textDecoration: 'underline' }}>
              Nochmal versuchen
            </button>
          </div>
        )}

        {!punkte && !fehler && (
          <div className="card" style={{ padding: '20px' }}>
            <div className="h-4 bg-gray-100 rounded animate-pulse mb-2" style={{ width: '60%' }} />
            <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '40%' }} />
          </div>
        )}

        {punkte?.length === 0 && (
          <div className="card p-10 text-center">
            <div className="text-4xl mb-3">🐾</div>
            <p className="text-gray-500 mb-1">Noch keine Geschichte</p>
            <p className="text-sm text-gray-400">
              Meilensteine entstehen aus dem, was die App beobachtet. Unter
              „Weiß ich" lässt sich die Historie auswerten.
            </p>
          </div>
        )}

        {jahre.map(([jahr, liste]) => (
          <div key={jahr}>
            <p style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              color: 'rgba(60,60,67,0.35)', marginBottom: 10,
            }}>
              {jahr}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {liste.map((p, i) => (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12 }}>
                  {/* Die Linie mit dem Punkt – zusammenhängend, damit die
                      Ereignisse als eine Geschichte lesbar sind. */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 999, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--surface, #fff)',
                      border: `1.5px solid ${FARBE[p.art]}40`,
                      fontSize: 12,
                    }}>
                      {ZEICHEN[p.art]}
                    </div>
                    {i < liste.length - 1 && (
                      <div style={{ width: 1.5, flex: 1, minHeight: 22, background: 'rgba(60,60,67,0.12)' }} />
                    )}
                  </div>

                  <div style={{ paddingBottom: i < liste.length - 1 ? 18 : 4 }}>
                    <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.4)', marginBottom: 2 }}>
                      {datum(p.tag)}
                      {p.bis && p.bis !== p.tag && ` bis ${datum(p.bis)}`}
                      {p.wer && ` · ${p.wer}`}
                    </p>
                    <p style={{ fontSize: 14.5, color: '#1C1C1E', lineHeight: 1.4, fontWeight: 500 }}>
                      {p.titel}
                    </p>

                    {p.fotoUrl && (
                      <Link
                        href={p.fotoId ? `/fotos?photo=${p.fotoId}` : '/fotos'}
                        className="relative block overflow-hidden"
                        style={{
                          marginTop: 8, width: '100%', maxWidth: 260, aspectRatio: '4 / 3',
                          borderRadius: 10, background: 'rgba(60,60,67,0.06)',
                        }}
                      >
                        <Image
                          src={p.fotoUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="260px"
                        />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}

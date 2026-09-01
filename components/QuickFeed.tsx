'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { consumePreviousCan , type PantryLike } from '@/lib/pantry'

/**
 * id ist null bei Sorten, die gerade nicht im Vorrat stehen. Die gibt es hier
 * bewusst: Eine Sorte, die seit Tagen gefüttert wird, deren Dose aber
 * unterwegs oder aufgebraucht ist, muss eintragbar bleiben.
 */
export type QuickFeedSort = { id: string | null; brand: string; type: string; quantity: number }

/**
 * Ein-Tipp-Erfassung fürs Dashboard.
 *
 * Hintergrund aus den echten Daten: an 37 von 51 erfassten Tagen gab es genau
 * eine Mahlzeit, nie mehr als zwei, und in 38 von 64 Fällen war es dieselbe
 * Sorte wie beim letzten Mal. Das lange Formular ist für diesen Normalfall
 * zu viel – hier reicht ein Tipp auf die Sorte.
 *
 * Gefüttert wird gemeinsam, also entsteht wie im Formular eine Zeile pro Katze
 * mit identischem Zeitstempel (darauf beruht dedupeSharedFeedings).
 */
export default function QuickFeed({
  sorts,
  pantry,
  catIds,
  householdNames,
}: {
  /** Die angezeigten Knöpfe – bewusst gekürzt, damit die Karte lesbar bleibt */
  sorts: QuickFeedSort[]
  /** Vollständiger Vorrat: Die aufzubrauchende Dose kann eine sein, die gerade
      keinen Knopf hat */
  pantry: QuickFeedSort[]
  catIds: string[]
  householdNames: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (sorts.length === 0 || catIds.length === 0) return null

  const log = async (sort: QuickFeedSort) => {
    const key = `${sort.brand}||${sort.type}`
    setSaving(key)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Nicht angemeldet.')
      setSaving(null)
      return
    }

    // Ein Zeitstempel für alle Katzen – sonst zählt die Mahlzeit doppelt
    const loggedAt = new Date().toISOString()
    const { error: insertError } = await supabase.from('feeding_logs').insert(
      catIds.map((cid) => ({
        cat_id: cid,
        user_id: user.id,
        logged_at: loggedAt,
        food_brand: sort.brand,
        food_type: sort.type,
      })),
    )

    if (insertError) {
      setSaving(null)
      setError('Konnte nicht gespeichert werden. Nochmal versuchen?')
      return
    }

    // Sortenwechsel = vorherige Dose war leer (gleiche Regel wie im Formular).
    // Nur echte Vorratseinträge übergeben: Sorten ohne Bestand haben keine
    // Kennung und können auch nicht abgezogen werden.
    await consumePreviousCan(supabase, {
      catId: catIds[0],
      loggedAt,
      newBrand: sort.brand,
      newType: sort.type,
      pantry: pantry.filter((p): p is PantryLike => p.id !== null),
    })

    setSaving(null)
    router.refresh()
  }

  return (
    <div style={{ padding: '14px 20px 16px', borderBottom: '0.5px solid rgba(60,60,67,0.07)' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(60,60,67,0.4)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 9 }}>
        Schnell eintragen
      </p>

      <div className="flex gap-2 flex-wrap">
        {sorts.map((s) => {
          const key = `${s.brand}||${s.type}`
          const busy = saving === key
          return (
            <button
              key={key}
              onClick={() => log(s)}
              disabled={saving !== null}
              className="pressable"
              style={{
                fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 12,
                background: 'rgba(var(--am-400-rgb), 0.1)', color: 'var(--am-600)',
                border: 'none', textAlign: 'left', opacity: saving && !busy ? 0.5 : 1,
              }}
            >
              {busy ? '⏳ ' : '🍽️ '}{s.type || s.brand}
              {/* Bestand nur zeigen, wenn es einen gibt – eine "· 0" hinter
                  einer Sorte sieht nach Fehler aus, nicht nach Angebot. */}
              {s.quantity > 0 && (
                <span style={{ fontWeight: 500, color: 'rgba(60,60,67,0.4)' }}> · {s.quantity}</span>
              )}
            </button>
          )
        })}
      </div>

      <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.35)', marginTop: 9 }}>
        Trägt für {householdNames} mit der aktuellen Uhrzeit ein.{' '}
        <Link href="/feeding/new" style={{ color: 'var(--am-600)', fontWeight: 600 }}>
          Mit Details eintragen
        </Link>
      </p>

      {error && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 8 }}>⚠ {error}</p>}
    </div>
  )
}

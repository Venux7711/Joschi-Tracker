'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { consumePreviousCan, type PantryLike } from '@/lib/pantry'
import { fromBerlinInputValue } from '@/lib/time'
import type { StoolConsistency } from '@/lib/types'

/**
 * Nachtragen direkt in der Tageszeile des Verlaufs.
 *
 * Grund: 69 % der Einträge entstehen nachträglich, und zwar hier – bisher
 * führte "+ Futter" auf ein leeres Formular auf einer anderen Seite. Für den
 * Normalfall (Sorte antippen) reicht das hier, das Formular bleibt für
 * Menge, Notiz und abweichende Uhrzeit verlinkt.
 *
 * 18:00 als Zeit, weil nachgetragen wird und die tatsächlichen Fütterungen
 * überwiegend abends liegen – dieselbe Vorgabe wie im Formular.
 */
const STOOL_OPTIONS: { stool: StoolConsistency; emoji: string; label: string }[] = [
  { stool: 'normal', emoji: '✅', label: 'Normal' },
  { stool: 'soft', emoji: '🟡', label: 'Weich' },
  { stool: 'diarrhea', emoji: '🔴', label: 'Durchfall' },
  { stool: 'not_observed', emoji: '👀', label: 'Nicht gesehen' },
]

export default function QuickAddDay({
  dateStr,
  sorts,
  pantry,
  catIds,
  activeCatId,
}: {
  /** YYYY-MM-DD */
  dateStr: string
  sorts: PantryLike[]
  pantry: PantryLike[]
  catIds: string[]
  activeCatId: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState<'food' | 'health' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loggedAt = () => fromBerlinInputValue(`${dateStr}T18:00`).toISOString()

  const addFood = async (sort: PantryLike) => {
    setBusy(sort.id); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Nicht angemeldet.'); setBusy(null); return }

    const at = loggedAt()
    const { error: insertError } = await supabase.from('feeding_logs').insert(
      catIds.map(cid => ({
        cat_id: cid, user_id: user.id, logged_at: at,
        food_brand: sort.brand, food_type: sort.type,
      })),
    )
    if (insertError) { setError('Konnte nicht gespeichert werden.'); setBusy(null); return }

    // Gleiche Regel wie überall: Sortenwechsel heißt, die vorherige Dose war leer
    await consumePreviousCan(supabase, {
      catId: catIds[0], loggedAt: at, newBrand: sort.brand, newType: sort.type, pantry,
    })

    setBusy(null); setOpen(null); router.refresh()
  }

  const addHealth = async (stool: StoolConsistency) => {
    setBusy(stool); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Nicht angemeldet.'); setBusy(null); return }

    const { error: insertError } = await supabase.from('health_logs').insert({
      cat_id: activeCatId, user_id: user.id, logged_at: loggedAt(),
      stool_consistency: stool, appetite: 'good', activity: 'normal',
      vomiting: false, fur_issue: false,
    })
    if (insertError) { setError('Konnte nicht gespeichert werden.'); setBusy(null); return }

    setBusy(null); setOpen(null); router.refresh()
  }

  const chip = (active: boolean, tone: 'amber' | 'blue') => ({
    fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, border: 'none',
    background: active
      ? (tone === 'amber' ? 'var(--am-500, #f59e0b)' : '#3B82F6')
      : (tone === 'amber' ? 'rgba(var(--am-400-rgb), 0.14)' : 'rgba(59,130,246,0.1)'),
    color: active ? 'white' : (tone === 'amber' ? 'var(--am-600)' : '#2563EB'),
  })

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(o => (o === 'food' ? null : 'food'))} style={chip(open === 'food', 'amber')}>
          + Futter
        </button>
        <button onClick={() => setOpen(o => (o === 'health' ? null : 'health'))} style={chip(open === 'health', 'blue')}>
          + Befinden
        </button>
      </div>

      {open === 'food' && (
        <div className="flex gap-1.5 flex-wrap justify-end">
          {sorts.length === 0 && (
            <span style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)' }}>Kein Vorrat hinterlegt</span>
          )}
          {sorts.map(s => (
            <button
              key={s.id}
              onClick={() => addFood(s)}
              disabled={busy !== null}
              style={{ ...chip(false, 'amber'), opacity: busy && busy !== s.id ? 0.5 : 1 }}
            >
              {busy === s.id ? '⏳' : '🍽️'} {s.type || s.brand}
            </button>
          ))}
          <Link href={`/feeding/new?date=${dateStr}`} style={{ ...chip(false, 'amber'), textDecoration: 'none' }}>
            mit Details…
          </Link>
        </div>
      )}

      {open === 'health' && (
        <div className="flex gap-1.5 flex-wrap justify-end">
          {STOOL_OPTIONS.map(o => (
            <button
              key={o.stool}
              onClick={() => addHealth(o.stool)}
              disabled={busy !== null}
              style={{ ...chip(false, 'blue'), opacity: busy && busy !== o.stool ? 0.5 : 1 }}
            >
              {busy === o.stool ? '⏳' : o.emoji} {o.label}
            </button>
          ))}
          <Link href={`/health/new?date=${dateStr}`} style={{ ...chip(false, 'blue'), textDecoration: 'none' }}>
            mit Details…
          </Link>
        </div>
      )}

      {error && <span style={{ fontSize: 11, color: '#DC2626' }}>⚠ {error}</span>}
    </div>
  )
}

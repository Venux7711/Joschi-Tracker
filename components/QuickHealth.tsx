'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { StoolConsistency } from '@/lib/types'

/**
 * Ein-Tipp-Erfassung fürs Befinden.
 *
 * Hintergrund aus den echten Daten: In 13 Einträgen war der Appetit 12× "gut"
 * und die Aktivität 13× "normal" – die einzige Angabe, die sich wirklich
 * ändert, ist der Stuhlgang. Trotzdem verlangt das Formular sechs Angaben,
 * und entsprechend selten wird es benutzt (Futter an 98 % der Tage erfasst,
 * Befinden an rund einem Viertel).
 *
 * Deshalb hier vier Knöpfe für den Stuhlgang mit den üblichen Werten als
 * Vorgabe. Erbrechen, Fell und Notiz bleiben dem Formular vorbehalten.
 */
const OPTIONS: { stool: StoolConsistency; emoji: string; label: string; color: string; bg: string }[] = [
  { stool: 'normal', emoji: '✅', label: 'Normal', color: '#15803D', bg: 'rgba(74,222,128,0.14)' },
  { stool: 'soft', emoji: '🟡', label: 'Weich', color: '#A16207', bg: 'rgba(250,204,21,0.16)' },
  { stool: 'diarrhea', emoji: '🔴', label: 'Durchfall', color: '#B91C1C', bg: 'rgba(248,113,113,0.16)' },
  { stool: 'not_observed', emoji: '👀', label: 'Nicht gesehen', color: '#57534E', bg: 'rgba(120,120,128,0.1)' },
]

export default function QuickHealth({ catId, catName }: { catId: string; catName: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const log = async (stool: StoolConsistency) => {
    setSaving(stool)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Nicht angemeldet.')
      setSaving(null)
      return
    }

    const { error: insertError } = await supabase.from('health_logs').insert({
      cat_id: catId,
      user_id: user.id,
      logged_at: new Date().toISOString(),
      stool_consistency: stool,
      // Die üblichen Werte als Vorgabe – abweichende Fälle über das Formular
      appetite: 'good',
      activity: 'normal',
      vomiting: false,
      fur_issue: false,
    })

    setSaving(null)
    if (insertError) {
      setError('Konnte nicht gespeichert werden. Nochmal versuchen?')
      return
    }
    router.refresh()
  }

  return (
    <div style={{ padding: '14px 20px 16px', borderBottom: '0.5px solid rgba(60,60,67,0.07)' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(60,60,67,0.4)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 9 }}>
        Stuhlgang schnell erfassen
      </p>

      <div className="flex gap-2 flex-wrap">
        {OPTIONS.map(o => {
          const busy = saving === o.stool
          return (
            <button
              key={o.stool}
              onClick={() => log(o.stool)}
              disabled={saving !== null}
              className="pressable"
              style={{
                fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 12,
                background: o.bg, color: o.color, border: 'none',
                opacity: saving && !busy ? 0.5 : 1,
              }}
            >
              {busy ? '⏳' : o.emoji} {o.label}
            </button>
          )
        })}
      </div>

      <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.35)', marginTop: 9 }}>
        Für {catName}, mit Appetit „gut" und Aktivität „normal".{' '}
        <Link href="/health/new" style={{ color: 'var(--am-600)', fontWeight: 600 }}>
          Erbrechen, Fell oder Notiz eintragen
        </Link>
      </p>

      {error && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 8 }}>⚠ {error}</p>}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { formatBerlin, toBerlinInputValue } from '@/lib/time'

/**
 * Datum plus Tageszeit statt eines Datum-Zeit-Feldes.
 *
 * Hintergrund aus den Daten: 35 von 63 Mahlzeiten stehen auf exakt 12:00 –
 * das ist der Vorgabewert beim Nachtragen aus dem Verlauf, keine echte
 * Uhrzeit. Erfasst wird überwiegend nachträglich, da weiß man "abends", aber
 * nicht 19:47. Die Minute genau lässt sich weiter eintragen, sie steht nur
 * nicht mehr im Weg.
 *
 * Die Zeiten der Chips folgen den tatsächlichen Fütterungen: die meisten
 * Einträge liegen zwischen 20 und 23 Uhr, danach 15 bis 20 Uhr.
 */
const SLOTS = [
  { label: 'Morgens', time: '08:00' },
  { label: 'Mittags', time: '12:30' },
  { label: 'Abends', time: '18:00' },
  { label: 'Spät', time: '21:00' },
]

export default function TimeChoice({
  value,
  onChange,
  label = 'Wann?',
}: {
  /** "YYYY-MM-DDTHH:mm" in Berliner Zeit */
  value: string
  onChange: (next: string) => void
  label?: string
}) {
  const [exact, setExact] = useState(false)

  const [datePart = '', timePart = ''] = value.split('T')
  const setDate = (d: string) => onChange(`${d}T${timePart || '12:00'}`)
  const setTime = (t: string) => onChange(`${datePart || toBerlinInputValue().slice(0, 10)}T${t}`)
  const now = () => onChange(toBerlinInputValue())

  return (
    <div>
      <label className="label">{label} *</label>

      <input
        type="date"
        value={datePart}
        onChange={e => setDate(e.target.value)}
        className="input-field"
        required
      />

      <div className="flex gap-2 flex-wrap mt-2">
        <button
          type="button"
          onClick={now}
          className="pressable"
          style={{
            fontSize: 13, fontWeight: 600, padding: '8px 13px', borderRadius: 10,
            background: 'rgba(var(--am-400-rgb), 0.14)', color: 'var(--am-600)', border: 'none',
          }}
        >
          Jetzt
        </button>
        {SLOTS.map(s => {
          const active = timePart === s.time
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => setTime(s.time)}
              className="pressable"
              style={{
                fontSize: 13, fontWeight: 600, padding: '8px 13px', borderRadius: 10, border: 'none',
                background: active ? 'var(--am-500, #f59e0b)' : 'rgba(120,120,128,0.1)',
                color: active ? 'white' : 'rgba(60,60,67,0.6)',
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mt-2">
        <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)' }}>
          {datePart && timePart
            ? formatBerlin(`${value}:00`, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
            : 'Bitte Datum und Zeit wählen'}
        </p>
        <button
          type="button"
          onClick={() => setExact(v => !v)}
          style={{ fontSize: 12, color: 'var(--am-600)', fontWeight: 600, flexShrink: 0 }}
        >
          {exact ? 'zuklappen' : 'genaue Uhrzeit'}
        </button>
      </div>

      {exact && (
        <input
          type="time"
          value={timePart}
          onChange={e => setTime(e.target.value)}
          className="input-field mt-2"
        />
      )}
    </div>
  )
}

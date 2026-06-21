'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Medication { id: string; name: string; dosage: string | null; frequency: string | null }

export default function MedicationsWidget() {
  const [meds, setMeds] = useState<Medication[]>([])

  useEffect(() => {
    fetch('/api/medications')
      .then(r => r.json())
      .then(d => setMeds((d.medications ?? []).filter((m: { active: boolean }) => m.active)))
      .catch(() => {})
  }, [])

  if (meds.length === 0) return null

  return (
    <div className="card p-4 mb-4 border-l-4 border-l-blue-400">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-gray-800">💊 Aktive Medikamente</p>
        <Link href="/medikamente" className="text-xs text-blue-500 hover:text-blue-700 font-medium">Alle →</Link>
      </div>
      <div className="space-y-1.5">
        {meds.map(m => (
          <div key={m.id} className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
            <span className="text-sm text-gray-700 font-medium">{m.name}</span>
            {m.dosage && <span className="text-xs text-gray-400">{m.dosage}</span>}
            {m.frequency && <span className="text-xs text-gray-400">· {m.frequency}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

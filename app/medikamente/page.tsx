'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'

interface Medication {
  id: string; name: string; dosage: string | null; frequency: string | null
  start_date: string | null; end_date: string | null; notes: string | null; active: boolean
}

const FREQUENCIES = ['1× täglich', '2× täglich', '3× täglich', 'Jeden 2. Tag', '1× wöchentlich', 'Nach Bedarf']

export default function MedikamentePage() {
  const [meds, setMeds] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', dosage: '', frequency: '', start_date: '', end_date: '', notes: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/medications')
    const data = await res.json()
    setMeds(data.medications ?? [])
    setLoading(false)
  }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    await fetch('/api/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, active: true }),
    })
    setForm({ name: '', dosage: '', frequency: '', start_date: '', end_date: '', notes: '' })
    setShowForm(false)
    await load()
    setSaving(false)
  }

  const toggle = async (med: Medication) => {
    await fetch('/api/medications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: med.id, active: !med.active }),
    })
    await load()
  }

  const del = async (id: string) => {
    if (!confirm('Medikament löschen?')) return
    await fetch('/api/medications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  const active = meds.filter(m => m.active)
  const inactive = meds.filter(m => !m.active)

  const MedCard = ({ med }: { med: Medication }) => (
    <div className={`card p-4 ${med.active ? 'border-l-4 border-l-green-400' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-800">{med.name}</p>
            {med.active && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Aktiv</span>}
          </div>
          {med.dosage && <p className="text-sm text-gray-600 mt-0.5">Dosis: {med.dosage}</p>}
          {med.frequency && <p className="text-sm text-gray-500">{med.frequency}</p>}
          {med.start_date && (
            <p className="text-xs text-gray-400 mt-1">
              Ab {new Date(med.start_date).toLocaleDateString('de-DE')}
              {med.end_date && ` bis ${new Date(med.end_date).toLocaleDateString('de-DE')}`}
            </p>
          )}
          {med.notes && <p className="text-xs text-gray-400 mt-1 italic">{med.notes}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => toggle(med)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${med.active ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
          >
            {med.active ? 'Beenden' : 'Reaktivieren'}
          </button>
          <button onClick={() => del(med.id)} className="text-xs px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">Löschen</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">â† Zurück</Link>
            <h1 className="text-xl font-bold text-gray-800">ðŸ’Š Medikamente</h1>
          </div>
          <button onClick={() => setShowForm(s => !s)} className="btn-primary text-sm">+ Neu</button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="card p-5 mb-5">
            <p className="font-bold text-gray-800 mb-4">Neues Medikament</p>
            <div className="space-y-3">
              <div>
                <label className="label">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Metronidazol, Fortiflora, Panacur" className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Dosis</label>
                  <input type="text" value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} placeholder="z.B. 0,5 ml" className="input-field" />
                </div>
                <div>
                  <label className="label">Häufigkeit</label>
                  <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className="input-field">
                    <option value="">— Wählen —</option>
                    {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="label">Ende</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="input-field" />
                </div>
              </div>
              <div>
                <label className="label">Notiz</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="z.B. ins Futter mischen" className="input-field" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Abbrechen</button>
                <button onClick={save} disabled={!form.name || saving} className="btn-primary">{saving ? 'Speichern…' : 'Speichern'}</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
        ) : (
          <>
            {active.length === 0 && inactive.length === 0 && (
              <div className="card p-10 text-center">
                <div className="text-5xl mb-3">ðŸ’Š</div>
                <p className="text-gray-500 mb-1">Keine Medikamente eingetragen</p>
                <p className="text-sm text-gray-400">Tippe auf ž+ Neu" um ein Medikament hinzuzufügen</p>
              </div>
            )}

            {active.length > 0 && (
              <div className="space-y-3 mb-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Aktive Medikamente</h2>
                {active.map(m => <MedCard key={m.id} med={m} />)}
              </div>
            )}

            {inactive.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Abgeschlossen</h2>
                {inactive.map(m => <MedCard key={m.id} med={m} />)}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'

interface Weight { id: string; weight_grams: number; notes: string | null; measured_at: string }

export default function GewichtPage() {
  const [weights, setWeights] = useState<Weight[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [grams, setGrams] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/weight')
    const data = await res.json()
    setWeights(data.weights ?? [])
    setLoading(false)
  }

  const save = async () => {
    if (!grams) return
    setSaving(true)
    await fetch('/api/weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_grams: parseInt(grams), notes: notes || null, measured_at: new Date().toISOString() }),
    })
    setGrams(''); setNotes(''); setShowForm(false)
    await load()
    setSaving(false)
  }

  const del = async (id: string) => {
    if (!confirm('Eintrag löschen?')) return
    await fetch('/api/weight', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  // Chart: last 15 weights reversed (oldest first)
  const chartData = [...weights].reverse().slice(-15)
  const maxG = Math.max(...chartData.map(w => w.weight_grams), 1)
  const minG = Math.min(...chartData.map(w => w.weight_grams), maxG)
  const range = maxG - minG || 100

  // Trend
  const trend = weights.length >= 2
    ? weights[0].weight_grams - weights[Math.min(weights.length - 1, 4)].weight_grams
    : 0
  const trendLabel = trend > 50 ? `▲ +${(trend / 1000).toFixed(2)} kg` : trend < -50 ? `▼ ${(trend / 1000).toFixed(2)} kg` : '→ Stabil'
  const trendColor = trend > 100 ? 'text-red-500' : trend < -100 ? 'text-orange-500' : 'text-green-600'

  const latest = weights[0]

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">← Zurück</Link>
            <h1 className="text-xl font-bold text-gray-800">⚖️ Gewichtsverlauf</h1>
          </div>
          <button onClick={() => setShowForm(s => !s)} className="btn-primary text-sm">+ Wiegen</button>
        </div>

        {/* Quick entry */}
        {showForm && (
          <div className="card p-4 mb-4">
            <p className="font-semibold text-gray-800 mb-3">Neues Gewicht</p>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="label">Gewicht in Gramm *</label>
                <input
                  type="number"
                  value={grams}
                  onChange={e => setGrams(e.target.value)}
                  placeholder="z.B. 4200"
                  className="input-field"
                  autoFocus
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="label">Notiz (optional)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="z.B. nach dem Fressen" className="input-field" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Abbrechen</button>
              <button onClick={save} disabled={!grams || saving} className="btn-primary">{saving ? 'Speichern…' : 'Speichern'}</button>
            </div>
          </div>
        )}

        {/* Current weight card */}
        {latest && (
          <div className="card p-5 mb-4 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-1">Aktuelles Gewicht</p>
                <p className="text-4xl font-black text-gray-800">{(latest.weight_grams / 1000).toFixed(2)} <span className="text-xl font-normal text-gray-500">kg</span></p>
                <p className="text-sm text-gray-500 mt-1">{new Date(latest.measured_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Trend (letzte 5)</p>
                <p className={`text-lg font-bold ${trendColor}`}>{trendLabel}</p>
              </div>
            </div>
          </div>
        )}

        {/* Chart */}
        {chartData.length >= 2 && (
          <div className="card p-5 mb-4">
            <p className="font-semibold text-gray-800 mb-4">Verlauf</p>
            <div className="flex items-end gap-1.5 h-28">
              {chartData.map((w, i) => {
                const h = ((w.weight_grams - minG) / range) * 80 + 20
                const isLatest = i === chartData.length - 1
                return (
                  <div key={w.id} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[8px] text-gray-400">{(w.weight_grams / 1000).toFixed(1)}</span>
                    <div
                      className={`w-full rounded-t transition-all ${isLatest ? 'bg-amber-500' : 'bg-amber-200'}`}
                      style={{ height: h }}
                    />
                    <span className="text-[8px] text-gray-400 rotate-0">
                      {new Date(w.measured_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{(minG / 1000).toFixed(2)} kg</span>
              <span>{(maxG / 1000).toFixed(2)} kg</span>
            </div>
          </div>
        )}

        {/* List */}
        <div className="card p-4">
          <p className="font-semibold text-gray-800 mb-3">Alle Einträge</p>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : weights.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Noch kein Gewicht eingetragen. Wiege Joschi und tippe auf ž+ Wiegen".</p>
          ) : (
            <div className="space-y-2">
              {weights.map((w, i) => (
                <div key={w.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <span className={`font-bold ${i === 0 ? 'text-amber-600' : 'text-gray-700'}`}>{(w.weight_grams / 1000).toFixed(3)} kg</span>
                    {w.notes && <span className="text-xs text-gray-400 ml-2">{w.notes}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{new Date(w.measured_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                    <button onClick={() => del(w.id)} className="text-gray-300 hover:text-red-400 text-sm transition-colors">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

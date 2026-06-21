'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'

interface HealthLog { logged_at: string; stool_consistency: string; appetite: string; activity: string; vomiting: boolean; fur_issue: boolean; notes: string | null }
interface FeedingLog { logged_at: string; food_brand: string; food_type: string; amount_grams: number | null }

const STOOL: Record<string, string> = { normal: 'Normal', soft: 'Weich', diarrhea: 'Durchfall ⚠️', not_observed: '—' }
const APPETITE: Record<string, string> = { good: 'Gut', reduced: 'Wenig', none: 'Gar nicht' }

export default function ReportPage() {
  const supabase = createClient()
  const reportRef = useRef<HTMLDivElement>(null)

  const [days, setDays] = useState(30)
  const [health, setHealth] = useState<HealthLog[]>([])
  const [feedings, setFeedings] = useState<FeedingLog[]>([])
  const [loading, setLoading] = useState(true)
  const [catName, setCatName] = useState('Joschi')

  useEffect(() => { load() }, [days])

  const load = async () => {
    setLoading(true)
    const { data: cats } = await supabase.from('cats').select('id, name').limit(1)
    const cat = cats?.[0]
    if (!cat) { setLoading(false); return }
    if (cat.name) setCatName(cat.name)

    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString()

    const [hRes, fRes] = await Promise.all([
      supabase.from('health_logs').select('*').eq('cat_id', cat.id).gte('logged_at', sinceStr).order('logged_at', { ascending: true }),
      supabase.from('feeding_logs').select('*').eq('cat_id', cat.id).gte('logged_at', sinceStr).order('logged_at', { ascending: true }),
    ])

    setHealth(hRes.data ?? [])
    setFeedings(fRes.data ?? [])
    setLoading(false)
  }

  const handlePrint = () => window.print()

  // Stats
  const diarrheaDays = new Set(health.filter(h => h.stool_consistency === 'diarrhea').map(h => h.logged_at.slice(0, 10))).size
  const goodDays = days - diarrheaDays
  const vomitingCount = health.filter(h => h.vomiting).length
  const furCount = health.filter(h => h.fur_issue).length

  const foodCounts: Record<string, number> = {}
  feedings.forEach(f => { if (f.food_type) foodCounts[f.food_type] = (foodCounts[f.food_type] ?? 0) + 1 })
  const topFoods = Object.entries(foodCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const today = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
  const since = new Date(); since.setDate(since.getDate() - days)
  const sinceStr = since.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })

  // Group health by week for mini chart
  const weekBars: { label: string; good: number; bad: number }[] = []
  for (let w = Math.ceil(days / 7) - 1; w >= 0; w--) {
    const wStart = new Date(); wStart.setDate(wStart.getDate() - (w + 1) * 7)
    const wEnd = new Date(); wEnd.setDate(wEnd.getDate() - w * 7)
    const wLogs = health.filter(h => { const d = new Date(h.logged_at); return d >= wStart && d < wEnd })
    const bad = wLogs.filter(h => h.stool_consistency === 'diarrhea').length
    weekBars.push({ label: `KW${Math.ceil((wEnd.getTime() - new Date(wEnd.getFullYear(), 0, 1).getTime()) / 604800000)}`, good: 7 - bad, bad })
  }

  return (
    <div className="min-h-screen bg-amber-50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">← Zurück</Link>
            <h1 className="text-xl font-bold text-gray-800">🏥 Tierarzt-Report</h1>
          </div>
          <button onClick={handlePrint} className="btn-primary text-sm">Drucken / PDF</button>
        </div>

        {/* Zeitraum */}
        <div className="flex gap-2 mb-5">
          {[14, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border ${days === d ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}>
              {d} Tage
            </button>
          ))}
        </div>

        {loading ? (
          <div className="card p-8 text-center text-gray-400">Lade Daten…</div>
        ) : (
          <div ref={reportRef} className="space-y-4 print:space-y-6">

            {/* Header */}
            <div className="card p-5 print:border print:border-gray-300">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-black text-gray-800">{catName} – Gesundheitsbericht</h2>
                  <p className="text-gray-500 text-sm mt-1">Zeitraum: {sinceStr} – {today}</p>
                  <p className="text-gray-400 text-xs mt-0.5">Rasse: Goldene Langhaar-Perser · Erkrankung: Rezidivierender Durchfall</p>
                </div>
                <div className="text-4xl">🐱</div>
              </div>
            </div>

            {/* Zusammenfassung */}
            <div className="card p-5">
              <h3 className="font-bold text-gray-800 mb-4">Zusammenfassung ({days} Tage)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-3xl font-black text-green-600">{goodDays}</div>
                  <div className="text-xs text-green-700 font-medium">Gute Tage</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <div className="text-3xl font-black text-red-500">{diarrheaDays}</div>
                  <div className="text-xs text-red-700 font-medium">Durchfall-Tage</div>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <div className="text-3xl font-black text-orange-500">{vomitingCount}</div>
                  <div className="text-xs text-orange-700 font-medium">Mal erbrochen</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <div className="text-3xl font-black text-amber-600">{feedings.length}</div>
                  <div className="text-xs text-amber-700 font-medium">Fütterungen</div>
                </div>
              </div>
              {furCount > 0 && (
                <div className="mt-3 bg-orange-50 rounded-xl p-3 text-center">
                  <span className="text-sm text-orange-700 font-medium">⚠️ Kot im Fell: {furCount}× aufgetreten</span>
                </div>
              )}
            </div>

            {/* Mini-Chart */}
            {weekBars.length > 0 && (
              <div className="card p-5">
                <h3 className="font-bold text-gray-800 mb-4">Verlauf nach Woche</h3>
                <div className="flex items-end gap-2 h-20">
                  {weekBars.map((bar, i) => {
                    const total = bar.good + bar.bad || 7
                    const badPct = (bar.bad / total) * 100
                    const goodPct = (bar.good / total) * 100
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex flex-col justify-end" style={{ height: 60 }}>
                          {bar.bad > 0 && <div className="w-full rounded-t" style={{ height: `${badPct}%`, background: '#ef4444' }} />}
                          {bar.good > 0 && <div className={`w-full ${bar.bad === 0 ? 'rounded' : 'rounded-b'}`} style={{ height: `${goodPct}%`, background: '#22c55e' }} />}
                        </div>
                        <span className="text-[9px] text-gray-400">{bar.label}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Gut</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Durchfall</span>
                </div>
              </div>
            )}

            {/* Futter */}
            {topFoods.length > 0 && (
              <div className="card p-5">
                <h3 className="font-bold text-gray-800 mb-3">Verabreichtes Futter (Top 5)</h3>
                <div className="space-y-2">
                  {topFoods.map(([food, count]) => (
                    <div key={food} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{food}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-2">
                          <div className="bg-amber-400 h-2 rounded-full" style={{ width: `${(count / (topFoods[0]?.[1] ?? 1)) * 100}%` }} />
                        </div>
                        <span className="text-sm text-gray-500 w-8 text-right">{count}×</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabellarische Übersicht */}
            <div className="card p-5">
              <h3 className="font-bold text-gray-800 mb-3">Tagesübersicht (Befinden)</h3>
              {health.length === 0 ? (
                <p className="text-gray-400 text-sm">Keine Befinden-Einträge im Zeitraum.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="pb-2 font-medium">Datum</th>
                        <th className="pb-2 font-medium">Stuhl</th>
                        <th className="pb-2 font-medium">Appetit</th>
                        <th className="pb-2 font-medium">Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.slice(-30).map(h => (
                        <tr key={h.logged_at} className={`border-b border-gray-50 ${h.stool_consistency === 'diarrhea' ? 'bg-red-50' : ''}`}>
                          <td className="py-1.5 text-gray-600 text-xs">{new Date(h.logged_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</td>
                          <td className={`py-1.5 font-medium text-xs ${h.stool_consistency === 'diarrhea' ? 'text-red-600' : 'text-gray-700'}`}>{STOOL[h.stool_consistency] ?? h.stool_consistency}</td>
                          <td className="py-1.5 text-gray-600 text-xs">{APPETITE[h.appetite] ?? h.appetite}</td>
                          <td className="py-1.5 text-gray-400 text-xs truncate max-w-[120px]">{h.notes ?? (h.vomiting ? 'Erbrochen' : '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 text-center pb-4">Erstellt mit Joschi Tracker · {today}</p>
          </div>
        )}
      </main>

      <style>{`
        @media print {
          .sm\\:hidden { display: none !important; }
          header { display: none !important; }
          nav { display: none !important; }
          body { background: white !important; padding: 0 !important; }
          .card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  )
}

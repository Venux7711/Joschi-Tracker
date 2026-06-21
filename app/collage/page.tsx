'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'

interface DayData {
  date: string
  label: string
  photo: { public_url: string; mood_tag: string } | null
  stool: string | null
  feedings: number
}

const STOOL_INFO: Record<string, { emoji: string; color: string; label: string }> = {
  normal: { emoji: '✓', color: '#22c55e', label: 'Normal' },
  soft: { emoji: '~', color: '#eab308', label: 'Weich' },
  diarrhea: { emoji: '⚠', color: '#ef4444', label: 'Durchfall' },
  not_observed: { emoji: '—', color: '#9ca3af', label: 'N/A' },
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export default function CollagePage() {
  const supabase = createClient()
  const [days, setDays] = useState<DayData[]>([])
  const [loading, setLoading] = useState(true)
  const [aiSummary, setAiSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: cats } = await supabase.from('cats').select('id').limit(1)
      const catId = cats?.[0]?.id
      if (!catId) { setLoading(false); return }

      const today = new Date()
      const last7: DayData[] = []

      for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10)
        const label = `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`

        const [healthRes, feedRes, photoRes] = await Promise.all([
          supabase.from('health_logs').select('stool_consistency').eq('cat_id', catId).gte('logged_at', `${dateStr}T00:00:00`).lte('logged_at', `${dateStr}T23:59:59`).limit(1),
          supabase.from('feeding_logs').select('id').eq('cat_id', catId).gte('logged_at', `${dateStr}T00:00:00`).lte('logged_at', `${dateStr}T23:59:59`),
          fetch(`/api/photos?date=${dateStr}&limit=1`).then(r => r.json()),
        ])

        last7.push({
          date: dateStr,
          label,
          stool: healthRes.data?.[0]?.stool_consistency ?? null,
          feedings: feedRes.data?.length ?? 0,
          photo: photoRes.photos?.[0] ?? null,
        })
      }

      setDays(last7)
      setLoading(false)
    }
    load()
  }, [])

  const generateSummary = async () => {
    setSummaryLoading(true)
    const good = days.filter(d => d.stool === 'normal' || d.stool === null).length
    const bad = days.filter(d => d.stool === 'diarrhea').length
    const totalFeedings = days.reduce((s, d) => s + d.feedings, 0)

    const prompt = `Joschi ist eine Perserkatze mit wiederkehrendem Durchfall. Schreibe eine kurze, warmherzige Wochenzusammenfassung (max. 60 Wörter, auf Deutsch):
Gute Tage: ${good}/7, Durchfall-Tage: ${bad}/7, Fütterungen: ${totalFeedings}.
${bad === 0 ? 'Es gab keinen Durchfall diese Woche!' : ''}`

    try {
      const r = await fetch('/api/analyze-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedings: [],
          health: days.filter(d => d.stool).map(d => ({ date: d.label, stool: d.stool, appetite: 'good', activity: 'normal', vomiting: false, furIssue: false })),
        }),
      })
      const data = await r.json()
      const text = data.analysis ?? ''
      // Take just first paragraph
      setAiSummary(text.split('\n\n')[0].replace(/\*\*/g, '').slice(0, 200))
    } catch {
      setAiSummary('Eine Woche voller Fürsorge für Joschi!')
    }
    setSummaryLoading(false)
  }

  const goodDays = days.filter(d => d.stool === 'normal' || d.stool === null).length
  const diarrheaDays = days.filter(d => d.stool === 'diarrhea').length
  const totalFeedings = days.reduce((s, d) => s + d.feedings, 0)

  return (
    <div className="min-h-screen bg-amber-50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">← Zurück</Link>
          <h1 className="text-xl font-bold text-gray-800">🗓️ Wochenrückblick</h1>
        </div>

        {/* Stats bar */}
        <div className="flex gap-3 mb-5">
          <div className="flex-1 card p-3 text-center">
            <div className="text-2xl font-black text-green-600">{goodDays}</div>
            <div className="text-xs text-gray-500">Gute Tage</div>
          </div>
          <div className="flex-1 card p-3 text-center">
            <div className="text-2xl font-black text-red-500">{diarrheaDays}</div>
            <div className="text-xs text-gray-500">Durchfall</div>
          </div>
          <div className="flex-1 card p-3 text-center">
            <div className="text-2xl font-black text-amber-600">{totalFeedings}</div>
            <div className="text-xs text-gray-500">Fütterungen</div>
          </div>
        </div>

        {/* Photo grid */}
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-5">
            {days.map(day => {
              const stoolInfo = day.stool ? STOOL_INFO[day.stool] : STOOL_INFO.not_observed
              return (
                <div key={day.date} className="aspect-square relative rounded-2xl overflow-hidden">
                  {day.photo ? (
                    <Image src={day.photo.public_url} alt={day.label} fill className="object-cover" sizes="25vw" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: `${stoolInfo.color}22` }}>
                      <span className="text-3xl" style={{ color: stoolInfo.color }}>{stoolInfo.emoji}</span>
                    </div>
                  )}
                  {/* Overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <p className="text-white text-xs font-bold">{day.label}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs" style={{ color: stoolInfo.color }}>●</span>
                      {day.feedings > 0 && <span className="text-white/70 text-xs">{day.feedings}×</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* AI Summary */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-gray-800">KI-Wochenzusammenfassung</p>
            <button
              onClick={generateSummary}
              disabled={summaryLoading || loading}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors disabled:opacity-50"
            >
              {summaryLoading ? '⏳ …' : '✨ Erstellen'}
            </button>
          </div>
          {aiSummary ? (
            <p className="text-gray-600 text-sm leading-relaxed">{aiSummary}</p>
          ) : (
            <p className="text-gray-400 text-sm">Tippe auf „Erstellen" für eine KI-Zusammenfassung der Woche.</p>
          )}
        </div>

        {/* Link to slideshow */}
        <Link href="/slideshow" className="card p-4 mt-3 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="font-semibold text-gray-800">🎬 Foto-Diashow</p>
            <p className="text-xs text-gray-500">Alle Fotos als animierte Präsentation</p>
          </div>
          <span className="text-gray-400">→</span>
        </Link>
      </main>
    </div>
  )
}

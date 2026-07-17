'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { pickActiveCat } from '@/lib/active-cat-client'
import { dedupeSharedFeedings } from '@/lib/utils'
import type { Cat } from '@/lib/types'

interface Photo { id: string; public_url: string; mood_tag: string; taken_at: string }

interface DayData {
  date: string
  label: string
  photo: Photo | null
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
      const { data: cats } = await supabase.from('cats').select('*').order('created_at', { ascending: true })
      const catId = pickActiveCat((cats ?? []) as Cat[])?.id
      if (!catId) { setLoading(false); return }
      const allCatIds = (cats ?? []).map((c) => c.id)

      const today = new Date()
      const since = new Date(today)
      since.setDate(today.getDate() - 6)
      const sinceStr = since.toISOString().slice(0, 10)
      const todayStr = today.toISOString().slice(0, 10)

      // Befinden individuell (aktive Katze), Fütterung geteilt (Haushalt)
      const [healthRes, feedRes, photoRes] = await Promise.all([
        supabase.from('health_logs').select('stool_consistency, logged_at')
          .eq('cat_id', catId)
          .gte('logged_at', `${sinceStr}T00:00:00`)
          .lte('logged_at', `${todayStr}T23:59:59`),
        supabase.from('feeding_logs').select('logged_at, food_brand, food_type')
          .in('cat_id', allCatIds)
          .gte('logged_at', `${sinceStr}T00:00:00`)
          .lte('logged_at', `${todayStr}T23:59:59`),
        fetch(`/api/photos?startDate=${sinceStr}&endDate=${todayStr}&limit=7`).then(r => r.json()),
      ])

      // Group by date
      const stoolByDate: Record<string, string> = {}
      healthRes.data?.forEach(h => { stoolByDate[h.logged_at.slice(0, 10)] = h.stool_consistency })

      const feedsByDate: Record<string, number> = {}
      dedupeSharedFeedings(feedRes.data ?? []).forEach(f => {
        const d = f.logged_at.slice(0, 10)
        feedsByDate[d] = (feedsByDate[d] ?? 0) + 1
      })

      const photoByDate: Record<string, Photo> = {}
      ;(photoRes.photos ?? []).forEach((p: Photo) => {
        const d = p.taken_at.slice(0, 10)
        if (!photoByDate[d]) photoByDate[d] = p
      })

      const result: DayData[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10)
        result.push({
          date: dateStr,
          label: `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`,
          stool: stoolByDate[dateStr] ?? null,
          feedings: feedsByDate[dateStr] ?? 0,
          photo: photoByDate[dateStr] ?? null,
        })
      }

      setDays(result)
      setLoading(false)
    }
    load()
  }, [])

  const generateSummary = async () => {
    setSummaryLoading(true)
    const good = days.filter(d => !d.stool || d.stool === 'normal').length
    const bad = days.filter(d => d.stool === 'diarrhea').length
    const totalFeedings = days.reduce((s, d) => s + d.feedings, 0)
    try {
      const r = await fetch('/api/analyze-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedings: [],
          health: days.filter(d => d.stool).map(d => ({
            date: d.label, stool: d.stool, appetite: 'good', activity: 'normal', vomiting: false, furIssue: false,
          })),
        }),
      })
      const data = await r.json()
      const text = (data.analysis ?? '').replace(/\*\*/g, '')
      setAiSummary(text.split('\n\n')[0].slice(0, 250))
    } catch {
      setAiSummary(`${good} gute Tage, ${bad} Durchfall-Tage, ${totalFeedings} Fütterungen diese Woche.`)
    }
    setSummaryLoading(false)
  }

  const goodDays = days.filter(d => !d.stool || d.stool === 'normal').length
  const diarrheaDays = days.filter(d => d.stool === 'diarrhea').length
  const totalFeedings = days.reduce((s, d) => s + d.feedings, 0)

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">← Zurück</Link>
          <h1 className="text-xl font-bold text-gray-800">🗓️ Wochenrückblick</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="card p-3 text-center">
            <div className="text-2xl font-black text-green-600">{goodDays}</div>
            <div className="text-xs text-gray-500">Gute Tage</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-2xl font-black text-red-500">{diarrheaDays}</div>
            <div className="text-xs text-gray-500">Durchfall</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-2xl font-black text-amber-600">{totalFeedings}</div>
            <div className="text-xs text-gray-500">Fütterungen</div>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 mb-5">
            {days.map(day => {
              const stoolInfo = STOOL_INFO[day.stool ?? 'not_observed']
              return (
                <div key={day.date} className="aspect-square relative rounded-2xl overflow-hidden">
                  {day.photo ? (
                    <Image src={day.photo.public_url} alt={day.label} fill className="object-cover" sizes="25vw" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: `${stoolInfo.color}20` }}>
                      <span className="text-2xl" style={{ color: stoolInfo.color }}>{stoolInfo.emoji}</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                    <p className="text-white text-[10px] font-bold leading-tight">{day.label}</p>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px]" style={{ color: stoolInfo.color }}>●</span>
                      {day.feedings > 0 && <span className="text-white/60 text-[9px]">{day.feedings}×</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* AI Summary */}
        <div className="card p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-gray-800">KI-Zusammenfassung</p>
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
            <p className="text-gray-400 text-sm">Tippe auf žErstellen" für eine KI-Zusammenfassung der Woche.</p>
          )}
        </div>

        <Link href="/slideshow" className="card p-4 flex items-center justify-between hover:shadow-md transition-shadow">
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

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Weight { id: string; weight_grams: number; measured_at: string }

export default function WeightWidget() {
  const [weights, setWeights] = useState<Weight[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/weight')
      .then(r => r.json())
      .then(d => { setWeights(d.weights ?? []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  if (!loaded || weights.length === 0) return null

  const latest = weights[0]
  const prev = weights[4] ?? weights[weights.length - 1]
  const diff = latest.weight_grams - prev.weight_grams
  const diffKg = (Math.abs(diff) / 1000).toFixed(3)
  const trending = diff > 50 ? 'up' : diff < -50 ? 'down' : 'stable'
  const trendColor = diff > 100 ? '#DC2626' : diff < -100 ? '#D97706' : '#16A34A'
  const trendLabel = weights.length > 1
    ? (diff === 0 ? 'Stabil' : `${diff > 0 ? '+' : '−'}${diffKg} kg`)
    : 'Erste Messung'

  const spark = [...weights].reverse().slice(-6)
  const max = Math.max(...spark.map(w => w.weight_grams))
  const min = Math.min(...spark.map(w => w.weight_grams))
  const range = max - min || 50

  return (
    <Link
      href="/gewicht"
      className="card flex items-center gap-5 transition-all active:scale-[0.98]"
      style={{ padding: '18px 20px' }}
    >
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(60,60,67,0.45)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
          Gewicht
        </p>
        <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: '#1C1C1E' }}>
          {(latest.weight_grams / 1000).toFixed(2)}{' '}
          <span style={{ fontSize: 15, fontWeight: 500, color: 'rgba(60,60,67,0.45)' }}>kg</span>
        </p>
        <p style={{ fontSize: 13, fontWeight: 500, color: trendColor, marginTop: 4 }}>
          {trending === 'up' ? '↑' : trending === 'down' ? '↓' : '→'} {trendLabel}
        </p>
      </div>

      <div className="flex items-end gap-1" style={{ height: 40 }}>
        {spark.map((w, i) => {
          const h = Math.max(4, ((w.weight_grams - min) / range) * 34 + 4)
          return (
            <div
              key={w.id}
              style={{
                width: 6,
                height: h,
                borderRadius: 3,
                background: i === spark.length - 1 ? '#FBBF24' : 'rgba(251,191,36,0.25)',
              }}
            />
          )
        })}
      </div>

      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="rgba(60,60,67,0.25)" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

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
  const trendIcon = diff > 50 ? '▲' : diff < -50 ? '▼' : '→'
  const trendColor = diff > 100 ? 'text-red-500' : diff < -100 ? 'text-orange-500' : 'text-green-600'

  // Mini sparkline: last 6 weights reversed
  const spark = [...weights].reverse().slice(-6)
  const max = Math.max(...spark.map(w => w.weight_grams))
  const min = Math.min(...spark.map(w => w.weight_grams))
  const range = max - min || 50

  return (
    <Link href="/gewicht" className="card p-4 mb-4 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Gewicht</p>
        <p className="text-2xl font-black text-gray-800">
          {(latest.weight_grams / 1000).toFixed(2)} <span className="text-base font-normal text-gray-500">kg</span>
        </p>
        <p className={`text-sm font-medium mt-0.5 ${trendColor}`}>
          {trendIcon} {weights.length > 1 ? (diff === 0 ? 'Stabil' : `${diff > 0 ? '+' : '-'}${diffKg} kg`) : 'Erste Messung'}
        </p>
      </div>

      {/* Sparkline */}
      <div className="flex items-end gap-1 h-10">
        {spark.map((w, i) => {
          const h = Math.max(4, ((w.weight_grams - min) / range) * 36 + 4)
          const isLast = i === spark.length - 1
          return (
            <div
              key={w.id}
              className={`w-2 rounded-sm ${isLast ? 'bg-amber-500' : 'bg-amber-200'}`}
              style={{ height: h }}
            />
          )
        })}
      </div>

      <span className="text-gray-300 text-lg">→</span>
    </Link>
  )
}

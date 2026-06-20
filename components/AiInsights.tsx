'use client'

import { useState } from 'react'

type FeedingEntry = {
  date: string; brand: string; type: string
  grams?: number; treat?: number; dry?: number; extras?: string
}
type HealthEntry = {
  date: string; stool: string; appetite: string; activity: string
  vomiting: boolean; furIssue: boolean; notes?: string
}

function renderAnalysis(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('**') && line.endsWith('**')) {
      return <p key={i} className="font-semibold text-gray-800 mt-3 first:mt-0">{line.replace(/\*\*/g, '')}</p>
    }
    if (line.startsWith('**')) {
      const parts = line.split('**')
      return (
        <p key={i} className="mt-3">
          <span className="font-semibold text-gray-800">{parts[1]}</span>
          <span className="text-gray-600">{parts[2]}</span>
        </p>
      )
    }
    if (!line.trim()) return <div key={i} className="h-1" />
    return <p key={i} className="text-gray-600 text-sm leading-relaxed">{line}</p>
  })
}

export default function AiInsights({
  feedings,
  health,
}: {
  feedings: FeedingEntry[]
  health: HealthEntry[]
}) {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const analyze = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/analyze-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedings, health }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnalysis(data.analysis)
    } catch {
      setError(true)
    }
    setLoading(false)
  }

  return (
    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl border border-violet-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-violet-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">🤖 KI-Auswertung</h3>
          <p className="text-xs text-gray-400 mt-0.5">Gemini analysiert Muster der letzten 30 Tage</p>
        </div>
        <button
          onClick={analyze}
          disabled={loading}
          className="text-xs font-medium text-violet-700 bg-white px-3 py-1.5 rounded-full border border-violet-200 hover:bg-violet-50 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {loading ? '⏳ Analysiert…' : analysis ? '↻ Neu' : '✦ Analysieren'}
        </button>
      </div>

      {!analysis && !loading && !error && (
        <div className="px-4 py-5 text-center">
          <p className="text-sm text-gray-400">
            Tippt auf "Analysieren" und Gemini sucht nach Zusammenhängen zwischen Futter, Leckerli und Joschis Befinden.
          </p>
        </div>
      )}

      {loading && (
        <div className="px-4 py-5 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-violet-600">
            <span className="animate-spin">⟳</span>
            Analysiere {feedings.length} Futter-Einträge und {health.length} Befinden-Einträge…
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 text-sm text-red-500 text-center">
          Analyse fehlgeschlagen. Bitte erneut versuchen.
        </div>
      )}

      {analysis && !loading && (
        <div className="px-4 py-4">
          {renderAnalysis(analysis)}
        </div>
      )}
    </div>
  )
}

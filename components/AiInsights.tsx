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
      return (
        <p key={i} style={{ fontWeight: 700, fontSize: 14, color: '#1C1C1E', marginTop: i === 0 ? 0 : 16, letterSpacing: '-0.01em' }}>
          {line.replace(/\*\*/g, '')}
        </p>
      )
    }
    if (line.startsWith('**')) {
      const parts = line.split('**')
      return (
        <p key={i} style={{ marginTop: i === 0 ? 0 : 14 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1C1C1E' }}>{parts[1]}</span>
          <span style={{ fontSize: 14, color: 'rgba(60,60,67,0.65)', lineHeight: 1.6 }}>{parts[2]}</span>
        </p>
      )
    }
    if (!line.trim()) return <div key={i} style={{ height: 4 }} />
    return <p key={i} style={{ fontSize: 14, color: 'rgba(60,60,67,0.65)', lineHeight: 1.6 }}>{line}</p>
  })
}

export default function AiInsights({
  feedings,
  health,
  pantry = [],
}: {
  feedings: FeedingEntry[]
  health: HealthEntry[]
  pantry?: string[]
}) {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const analyze = async () => {
    setLoading(true)
    setError(null)
    setStatus(null)

    const maxAttempts = 3
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch('/api/analyze-health', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedings, health, pantry }),
        })
        const data = await res.json()

        if (res.ok && data.analysis) {
          setAnalysis(data.analysis)
          setStatus(null)
          setLoading(false)
          return
        }

        // Transiente Überlastung → automatisch erneut versuchen
        const retriable = res.status === 503 || data.retriable === true
        if (retriable && attempt < maxAttempts - 1) {
          setStatus(`Gemini ist gerade überlastet – neuer Versuch (${attempt + 2}/${maxAttempts})…`)
          await new Promise((r) => setTimeout(r, (attempt + 1) * 2500))
          continue
        }

        setError(data.detail ?? data.error ?? 'Unbekannter Fehler')
        setStatus(null)
        setLoading(false)
        return
      } catch (e) {
        // Netzwerkfehler → ebenfalls erneut versuchen
        if (attempt < maxAttempts - 1) {
          setStatus(`Verbindungsproblem – neuer Versuch (${attempt + 2}/${maxAttempts})…`)
          await new Promise((r) => setTimeout(r, (attempt + 1) * 2500))
          continue
        }
        setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
        setStatus(null)
        setLoading(false)
        return
      }
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>KI-Auswertung</h3>
        <button
          onClick={analyze}
          disabled={loading}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: loading ? 'rgba(60,60,67,0.35)' : '#7C3AED',
            background: 'rgba(124,58,237,0.08)',
            padding: '6px 14px',
            borderRadius: 999,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {loading ? 'Analysiert…' : analysis ? 'Neu analysieren' : 'Analysieren'}
        </button>
      </div>

      {!analysis && !loading && !error && (
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'rgba(60,60,67,0.4)', lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
            Gemini analysiert Muster zwischen Futter und Joschis Befinden der letzten 30 Tage.
          </p>
        </div>
      )}

      {loading && (
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#7C3AED' }}>
            {status ?? `Analysiere ${feedings.length} Einträge…`}
          </p>
          {status && (
            <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 4 }}>
              Das kann bei hoher Auslastung einen Moment dauern.
            </p>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 13, color: '#DC2626', fontWeight: 500 }}>Analyse fehlgeschlagen</p>
          <p style={{ fontSize: 12, color: 'rgba(220,38,38,0.6)', marginTop: 4, wordBreak: 'break-all' }}>{error}</p>
        </div>
      )}

      {analysis && !loading && (
        <div style={{ padding: '16px 20px' }}>
          {renderAnalysis(analysis)}
        </div>
      )}
    </div>
  )
}

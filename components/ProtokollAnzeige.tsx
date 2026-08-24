'use client'

import { useState } from 'react'

/**
 * Zeigt ein technisches Protokoll mit einem Knopf zum Kopieren.
 *
 * Der Sinn: Das Video-Verkleinern läuft auf einem Gerät, an das beim
 * Entwickeln niemand herankommt. Statt aus der Ferne zu raten, wird das
 * Protokoll hier ausgegeben und lässt sich in einem Tipp weitergeben.
 */
export default function ProtokollAnzeige({
  text,
  titel = 'Technische Details',
  offen = false,
}: {
  text: string
  titel?: string
  offen?: boolean
}) {
  const [kopiert, setKopiert] = useState(false)

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setKopiert(true)
      setTimeout(() => setKopiert(false), 2500)
    } catch {
      // Ohne Zwischenablage-Erlaubnis: Text markieren lassen, dann geht es
      // über das übliche Auswählen und Kopieren
      const feld = document.getElementById('protokoll-text')
      if (feld) {
        const auswahl = window.getSelection()
        const bereich = document.createRange()
        bereich.selectNodeContents(feld)
        auswahl?.removeAllRanges()
        auswahl?.addRange(bereich)
      }
    }
  }

  if (!text) return null

  return (
    <details open={offen} style={{ marginTop: 10 }}>
      <summary style={{ fontSize: 12, cursor: 'pointer', color: 'rgba(60,60,67,0.55)' }}>
        {titel}
      </summary>

      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={kopieren}
          style={{
            fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
            background: 'rgba(60,60,67,0.08)', color: '#3C3C43', border: 'none',
          }}
        >
          {kopiert ? 'Kopiert ✓' : 'Protokoll kopieren'}
        </button>
        <span style={{ fontSize: 11, color: 'rgba(60,60,67,0.4)' }}>
          {text.split('\n').length} Zeilen
        </span>
      </div>

      <pre
        id="protokoll-text"
        style={{
          marginTop: 8, padding: 10, borderRadius: 8, maxHeight: 260, overflow: 'auto',
          background: 'rgba(60,60,67,0.05)', fontSize: 10, lineHeight: 1.45,
          whiteSpace: 'pre', color: '#3C3C43',
          // Auf dem Handy auswählbar halten, falls die Zwischenablage klemmt
          WebkitUserSelect: 'text', userSelect: 'text',
        }}
      >
        {text}
      </pre>
    </details>
  )
}

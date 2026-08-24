'use client'

import { useEffect, useState } from 'react'
import ProtokollAnzeige from '@/components/ProtokollAnzeige'
import { letztesProtokoll } from '@/lib/video-debug'

/**
 * Das letzte Video-Protokoll, auch später noch auffindbar.
 *
 * Auf der Fotoseite steht es nur direkt nach dem Versuch. Wer die Seite
 * verlässt, findet es sonst nicht wieder – und beim Weitergeben liegt oft
 * genau dazwischen.
 */
export default function VideoProtokoll() {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => { setText(letztesProtokoll()) }, [])

  if (!text) return null

  return (
    <div className="card" style={{ padding: '14px 20px' }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1C1C1E' }}>Letztes Video-Protokoll</h2>
      <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)', marginTop: 2 }}>
        Vom letzten Verkleinern eines Videos. Enthält keine Bildinhalte, nur
        Zeiten und Zustände – hilfreich, wenn etwas nicht klappt.
      </p>
      <ProtokollAnzeige text={text} titel="Protokoll ansehen" />
    </div>
  )
}

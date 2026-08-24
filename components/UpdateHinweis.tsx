'use client'

import { useEffect, useState } from 'react'
import { AKTUELLE_VERSION } from '@/lib/version'

/**
 * Meldet, wenn eine neuere Fassung ausgeliefert wird als die hier laufende.
 *
 * Als App auf dem Startbildschirm bleibt eine Seite auf dem iPhone tagelang
 * im Hintergrund geladen und holt sich nichts Neues. Man tippt aufs Symbol,
 * das alte Programm meldet sich zurück – und wundert sich, dass eine
 * Korrektur nicht wirkt.
 *
 * Geprüft wird beim Öffnen und jedes Mal, wenn die App wieder in den
 * Vordergrund kommt: genau dann würde man sonst mit dem alten Stand
 * weitermachen.
 */
export default function UpdateHinweis() {
  const [neu, setNeu] = useState(false)

  useEffect(() => {
    // In der Entwicklung gibt es keine Commit-Kennung – dann nichts prüfen,
    // sonst meldete es dauernd einen Unterschied
    if (AKTUELLE_VERSION === 'dev') return

    const pruefe = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const daten = await res.json()
        if (daten.version && daten.version !== 'dev' && daten.version !== AKTUELLE_VERSION) {
          setNeu(true)
        }
      } catch {
        // Kein Netz: kein Grund, irgendetwas zu melden
      }
    }

    pruefe()
    const beiRueckkehr = () => { if (document.visibilityState === 'visible') pruefe() }
    document.addEventListener('visibilitychange', beiRueckkehr)
    return () => document.removeEventListener('visibilitychange', beiRueckkehr)
  }, [])

  if (!neu) return null

  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed left-0 right-0 flex items-center justify-center gap-2"
      style={{
        top: 0, zIndex: 70, padding: '10px 16px',
        paddingTop: 'calc(10px + env(safe-area-inset-top))',
        background: 'var(--am-500, #f59e0b)', color: 'white',
        fontSize: 13, fontWeight: 600, border: 'none',
      }}
    >
      Neue Version verfügbar – tippen zum Neuladen
    </button>
  )
}

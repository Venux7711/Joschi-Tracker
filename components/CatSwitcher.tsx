'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getActiveCatIdClient, setActiveCatIdClient,
  getActiveCatThemeClient, setActiveCatThemeClient,
} from '@/lib/active-cat-client'
import { getCatTheme } from '@/lib/cat-theme'
import type { Cat } from '@/lib/types'

export default function CatSwitcher() {
  const router = useRouter()
  const [cats, setCats] = useState<Cat[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/cats').then((r) => r.json()).then((d) => {
      const list: Cat[] = d.cats ?? []
      setCats(list)
      if (list.length) {
        const stored = getActiveCatIdClient()
        const active = list.find((c) => c.id === stored) ?? list[0]
        setActiveId(active.id)
        // Theme-Cookie mit der aktiven Katze synchron halten. Der Server rendert
        // bei fehlendem Cookie amber – nur bei echter Abweichung (z.B. Bella aktiv,
        // aber App noch amber) einmal refreshen, damit sich die App sofort umfärbt.
        const themeVal = active.theme ?? 'amber'
        const serverTheme = getActiveCatThemeClient() ?? 'amber'
        setActiveCatThemeClient(themeVal)
        if (serverTheme !== themeVal) router.refresh()
      }
    })
  }, [])

  // Nur sichtbar, wenn es überhaupt etwas zum Umschalten gibt
  if (cats.length < 2) return null

  const select = (id: string) => {
    if (id === activeId) return
    const cat = cats.find((c) => c.id === id)
    setActiveId(id)
    setActiveCatIdClient(id)
    setActiveCatThemeClient(cat?.theme ?? 'amber')
    // Voller Reload statt router.refresh(): Client-Seiten (Gewicht, Medis, Fotos …)
    // laden ihre Daten nur beim Mount – ein RSC-Refresh würde sie mit der alten
    // Katze stehen lassen.
    window.location.reload()
  }

  return (
    <div
      className="flex gap-1 p-1 rounded-xl"
      style={{ background: 'rgba(120,120,128,0.08)', width: 'fit-content', marginBottom: 10 }}
      role="tablist"
      aria-label="Katze wählen"
    >
      {cats.map((cat) => {
        const theme = getCatTheme(cat.theme)
        const active = cat.id === activeId
        return (
          <button
            key={cat.id}
            onClick={() => select(cat.id)}
            role="tab"
            aria-selected={active}
            style={{
              padding: '6px 14px',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              border: 'none',
              cursor: 'pointer',
              color: active ? theme.accent : 'rgba(60,60,67,0.5)',
              background: active ? theme.accentTint : 'transparent',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            🐾 {cat.name}
          </button>
        )
      })}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getActiveCatIdClient, setActiveCatIdClient } from '@/lib/active-cat-client'
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
        setActiveId(list.find((c) => c.id === stored)?.id ?? list[0].id)
      }
    })
  }, [])

  // Nur sichtbar, wenn es überhaupt etwas zum Umschalten gibt
  if (cats.length < 2) return null

  const select = (id: string) => {
    if (id === activeId) return
    setActiveId(id)
    setActiveCatIdClient(id)
    router.refresh()
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

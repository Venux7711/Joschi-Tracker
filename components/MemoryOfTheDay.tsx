'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { berlinDateKey, berlinYear, formatBerlin } from '@/lib/time'
import { hasStill, isVideo, kachelQuelle, ansichtQuelle } from '@/lib/media'

interface Photo {
  id: string
  public_url: string
  mood_tag: string
  taken_at: string
  media_type: string | null
  poster_url: string | null
}

const MOOD_LABELS: Record<string, string> = {
  good: 'Guter Tag',
  bad: 'Durchfall-Tag',
  normal: 'Normaler Tag',
  sick: 'Kranker Tag',
  vet: 'Tierarzt-Tag',
}

export default function MemoryOfTheDay() {
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Heute vor einem Jahr, nach Berliner Kalender
    const now = new Date()
    const dateStr = `${berlinYear(now) - 1}-${berlinDateKey(now).slice(5)}`

    // Mehr als eins anfragen: Ein Video ohne Standbild ließe sich hier nicht
    // zeigen, dann rückt der nächste Eintrag des Tages nach.
    fetch(`/api/photos?date=${dateStr}&limit=10`)
      .then(r => r.json())
      .then(d => {
        const brauchbar: Photo[] = (d.photos ?? []).filter(hasStill)
        if (brauchbar.length > 0) setPhoto(brauchbar[0])
      })
      .catch(() => {})
  }, [])

  if (!photo) return null

  const dateStr = formatBerlin(photo.taken_at, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <div className="card p-4 mb-4 border border-amber-200 bg-amber-50/80">
        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Erinnerung – Heute vor einem Jahr</p>
        <div className="flex gap-3 items-center">
          <button onClick={() => setOpen(true)} className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
            <Image {...kachelQuelle(photo)} alt="Vor einem Jahr" fill className="object-cover" sizes="64px" />
            {isVideo(photo) && (
              <span className="absolute inset-0 flex items-center justify-center text-white text-sm" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>▶</span>
            )}
          </button>
          <div>
            <p className="font-medium text-gray-800 text-sm">{dateStr}</p>
            <p className="text-xs text-gray-500">{MOOD_LABELS[photo.mood_tag] ?? photo.mood_tag}</p>
            <button onClick={() => setOpen(true)} className="text-xs text-amber-600 hover:text-amber-700 mt-1 font-medium">
              Foto ansehen →
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="relative max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="relative aspect-square rounded-2xl overflow-hidden">
              <Image {...ansichtQuelle(photo)} alt="" fill className="object-contain" sizes="100vw" />
            </div>
            <p className="text-white text-center mt-3 font-medium">{dateStr}</p>
            <button onClick={() => setOpen(false)} className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">×</button>
          </div>
        </div>
      )}
    </>
  )
}

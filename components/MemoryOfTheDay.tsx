'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface Photo {
  id: string
  public_url: string
  mood_tag: string
  taken_at: string
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
    const today = new Date()
    const lastYear = new Date(today)
    lastYear.setFullYear(today.getFullYear() - 1)
    const dateStr = lastYear.toISOString().slice(0, 10)

    fetch(`/api/photos?date=${dateStr}&limit=1`)
      .then(r => r.json())
      .then(d => {
        if (d.photos?.length > 0) setPhoto(d.photos[0])
      })
      .catch(() => {})
  }, [])

  if (!photo) return null

  const dateStr = new Date(photo.taken_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <div className="card p-4 mb-4 border border-amber-200 bg-amber-50/80">
        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Erinnerung – Heute vor einem Jahr</p>
        <div className="flex gap-3 items-center">
          <button onClick={() => setOpen(true)} className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
            <Image src={photo.public_url} alt="Vor einem Jahr" fill className="object-cover" sizes="64px" />
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
              <Image src={photo.public_url} alt="" fill className="object-contain" sizes="100vw" />
            </div>
            <p className="text-white text-center mt-3 font-medium">{dateStr}</p>
            <button onClick={() => setOpen(false)} className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">×</button>
          </div>
        </div>
      )}
    </>
  )
}

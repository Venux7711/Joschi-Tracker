'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface Photo {
  id: string
  public_url: string
  mood_tag: string
  caption: string | null
  taken_at: string
}

const MOOD_COLORS: Record<string, string> = {
  good: '#22c55e',
  bad: '#ef4444',
  normal: '#9ca3af',
  sick: '#f97316',
  vet: '#3b82f6',
}

const MOOD_LABELS: Record<string, string> = {
  good: 'Guter Tag',
  bad: 'Durchfall-Tag',
  normal: 'Normaler Tag',
  sick: 'Kranker Tag',
  vet: 'Tierarzt-Tag',
}

export default function SlideshowPage() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    fetch('/api/photos?limit=200')
      .then(r => r.json())
      .then(d => {
        const sorted = (d.photos ?? []).sort((a: Photo, b: Photo) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime())
        setPhotos(sorted)
        setLoading(false)
      })
  }, [])

  const next = useCallback(() => {
    setVisible(false)
    setTimeout(() => {
      setCurrent(c => (c + 1) % photos.length)
      setVisible(true)
    }, 400)
  }, [photos.length])

  const prev = () => {
    setVisible(false)
    setTimeout(() => {
      setCurrent(c => (c - 1 + photos.length) % photos.length)
      setVisible(true)
    }, 400)
  }

  useEffect(() => {
    if (!playing || photos.length <= 1) return
    const timer = setInterval(next, 3500)
    return () => clearInterval(timer)
  }, [playing, photos.length, next])

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white text-center">
        <div className="text-5xl mb-4 animate-pulse">📸</div>
        <p>Fotos laden…</p>
      </div>
    </div>
  )

  if (photos.length === 0) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white text-center p-6">
      <div className="text-5xl mb-4">📸</div>
      <p className="text-xl font-bold mb-2">Noch keine Fotos</p>
      <p className="text-gray-400 mb-6">Füge Fotos beim Befinden-Eintragen hinzu</p>
      <Link href="/health/new" className="bg-amber-500 text-white px-6 py-3 rounded-2xl font-bold">Befinden eintragen</Link>
    </div>
  )

  const photo = photos[current]
  const dateStr = new Date(photo.taken_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
  const moodColor = MOOD_COLORS[photo.mood_tag] ?? '#9ca3af'
  const moodLabel = MOOD_LABELS[photo.mood_tag] ?? photo.mood_tag
  const progress = ((current + 1) / photos.length) * 100

  return (
    <div className="min-h-screen bg-black flex flex-col select-none">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
        <Link href="/fotos" className="bg-white/20 text-white px-3 py-1.5 rounded-full text-sm font-medium">← Fotos</Link>
        <span className="text-white/60 text-sm">{current + 1} / {photos.length}</span>
        <button onClick={() => setPlaying(p => !p)} className="bg-white/20 text-white px-3 py-1.5 rounded-full text-sm font-medium">
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>

      {/* Photo */}
      <div
        className="flex-1 relative cursor-pointer"
        onClick={() => setPlaying(p => !p)}
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}
      >
        <Image src={photo.public_url} alt="" fill className="object-contain" sizes="100vw" priority />

        {/* Bottom overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-6 pt-16">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: moodColor }} />
            <span className="text-white/80 text-sm font-medium">{moodLabel}</span>
          </div>
          <p className="text-white font-bold text-lg">{dateStr}</p>
          {photo.caption && <p className="text-white/70 text-sm mt-1">{photo.caption}</p>}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/20">
        <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6 py-5 bg-black">
        <button onClick={prev} className="text-white/70 hover:text-white text-3xl w-12 h-12 flex items-center justify-center">‹</button>

        {/* Dots (max 12) */}
        <div className="flex gap-1 overflow-hidden max-w-[200px]">
          {photos.length <= 12 ? (
            photos.map((_, i) => (
              <button
                key={i}
                onClick={() => { setVisible(false); setTimeout(() => { setCurrent(i); setVisible(true) }, 200) }}
                className={`rounded-full transition-all ${i === current ? 'bg-amber-400 w-4 h-2' : 'bg-white/30 w-2 h-2'}`}
              />
            ))
          ) : (
            <span className="text-white/50 text-sm">{current + 1} von {photos.length}</span>
          )}
        </div>

        <button onClick={next} className="text-white/70 hover:text-white text-3xl w-12 h-12 flex items-center justify-center">›</button>
      </div>
    </div>
  )
}

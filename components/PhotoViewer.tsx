'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import PhotoInteractions from '@/components/PhotoInteractions'
import { formatBerlin } from '@/lib/time'
import type { Cat } from '@/lib/types'

export type ViewerPhoto = {
  id: string
  public_url: string
  storage_path: string
  mood_tag: string
  caption: string | null
  taken_at: string
  cat_id: string | null
  cat_ids: string[] | null
  lat: number | null
  lng: number | null
}

const MOOD_LABELS: Record<string, { label: string; color: string }> = {
  good: { label: 'Guter Tag', color: 'bg-green-100 text-green-700' },
  bad: { label: 'Durchfall', color: 'bg-red-100 text-red-700' },
  normal: { label: 'Normal', color: 'bg-gray-100 text-gray-600' },
  sick: { label: 'Krank', color: 'bg-orange-100 text-orange-700' },
  vet: { label: 'Tierarzt', color: 'bg-blue-100 text-blue-700' },
}

/**
 * Vollbild-Betrachter.
 *
 * Vorher steckte das Bild in einem quadratischen Rahmen mit object-contain.
 * Bei Hochkant-Aufnahmen – und das sind fast alle Handyfotos – füllte es darin
 * nur gut die halbe Breite, der Rest blieb leer. Deshalb wirkten die Bilder so
 * klein. Jetzt bekommt das Foto den ganzen Bildschirm.
 *
 * Dazu, was man von einem Album erwartet: Wischen und Pfeiltasten zum
 * Blättern, ein Zähler, Escape zum Schließen, und ein Tipp aufs Bild blendet
 * die Bedienelemente weg, sodass nur noch das Foto da ist.
 */
export default function PhotoViewer({
  photos,
  index,
  cats,
  onIndexChange,
  onClose,
  onToggleTag,
  onDelete,
}: {
  photos: ViewerPhoto[]
  index: number
  cats: Cat[]
  onIndexChange: (next: number) => void
  onClose: () => void
  onToggleTag: (photo: ViewerPhoto, catId: string) => Promise<void>
  onDelete: (photo: ViewerPhoto) => void
}) {
  const [chrome, setChrome] = useState(true)
  const [savingTag, setSavingTag] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const photo = photos[index]
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  const go = useCallback((delta: number) => {
    const next = index + delta
    if (next >= 0 && next < photos.length) onIndexChange(next)
  }, [index, photos.length, onIndexChange])

  // Tastatur: blättern und schließen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  // Hintergrund nicht mitscrollen lassen, solange der Betrachter offen ist
  useEffect(() => {
    const vorher = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = vorher }
  }, [])

  if (!photo) return null

  const catTags = photo.cat_ids?.length ? photo.cat_ids : photo.cat_id ? [photo.cat_id] : []

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    // Waagerecht blättern, senkrecht schließen – aber nur bei klarer Richtung,
    // sonst löst schon ein leichtes Verrutschen beim Antippen etwas aus
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose()
  }

  return (
    <div className="fixed inset-0 z-50" style={{ background: '#000' }}>
      {/* Bild – füllt den Bildschirm, Seitenverhältnis bleibt erhalten */}
      <div
        className="absolute inset-0"
        onClick={() => setChrome(c => !c)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image
          key={photo.id}
          src={photo.public_url}
          alt={photo.caption ?? ''}
          fill
          className="object-contain"
          sizes="100vw"
          priority
        />
      </div>

      {/* Blättern mit der Maus – auf dem Handy wird gewischt */}
      {chrome && hasPrev && (
        <button
          onClick={() => go(-1)}
          aria-label="Vorheriges Foto"
          className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full"
          style={{ background: 'rgba(0,0,0,0.45)', color: 'white', fontSize: 22 }}
        >
          ‹
        </button>
      )}
      {chrome && hasNext && (
        <button
          onClick={() => go(1)}
          aria-label="Nächstes Foto"
          className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full"
          style={{ background: 'rgba(0,0,0,0.45)', color: 'white', fontSize: 22 }}
        >
          ›
        </button>
      )}

      {/* Kopfzeile: Zähler und Schließen */}
      {chrome && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between"
          style={{
            padding: '14px 16px',
            paddingTop: 'calc(14px + env(safe-area-inset-top))',
            background: 'linear-gradient(rgba(0,0,0,0.55), transparent)',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600 }}>
            {index + 1} von {photos.length}
          </span>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(0,0,0,0.45)', color: 'white', fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Fußbereich: Angaben, Markierung, Reaktionen, Kommentare */}
      {chrome && (
        <div
          className="absolute bottom-0 left-0 right-0 overflow-y-auto"
          style={{
            maxHeight: '62vh',
            padding: '18px 16px',
            paddingBottom: 'calc(18px + env(safe-area-inset-bottom))',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.72) 22%, rgba(0,0,0,0.92))',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {photo.mood_tag !== 'normal' && (
                  <span className={`text-xs px-2 py-1 rounded-full ${MOOD_LABELS[photo.mood_tag]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                    {MOOD_LABELS[photo.mood_tag]?.label ?? photo.mood_tag}
                  </span>
                )}
                <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                  {formatBerlin(photo.taken_at, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              {photo.caption && (
                <p style={{ color: 'white', fontSize: 14, marginTop: 4 }}>{photo.caption}</p>
              )}
              {photo.lat !== null && photo.lng !== null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${photo.lat}&mlon=${photo.lng}#map=16/${photo.lat}/${photo.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 3, display: 'inline-block' }}
                >
                  📍 {photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}
                </a>
              )}
            </div>
            <button
              onClick={() => onDelete(photo)}
              className="text-red-400 text-xs px-2 py-1 rounded-lg flex-shrink-0"
              style={{ border: '1px solid rgba(248,113,113,0.35)' }}
            >
              Löschen
            </button>
          </div>

          {/* Wer ist drauf */}
          {cats.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Wer ist drauf?
              </span>
              {cats.map(c => {
                const aktiv = catTags.includes(c.id)
                return (
                  <button
                    key={c.id}
                    disabled={savingTag}
                    onClick={async () => {
                      setSavingTag(true)
                      await onToggleTag(photo, c.id)
                      setSavingTag(false)
                    }}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999, border: 'none',
                      background: aktiv ? 'var(--am-500, #f59e0b)' : 'rgba(255,255,255,0.14)',
                      color: 'white', opacity: savingTag ? 0.6 : 1,
                    }}
                  >
                    {aktiv ? '✓' : '🐾'} {c.name}
                  </button>
                )
              })}
            </div>
          )}

          <PhotoInteractions photoId={photo.id} />
        </div>
      )}
    </div>
  )
}

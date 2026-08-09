'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export type BirthdayCat = {
  id: string
  name: string
  age: number
  isToday: boolean
  photoUrl: string | null
  gradient: string
  accent: string
}

export type BirthdayPhoto = { id: string; public_url: string }

/**
 * Konfetti ohne Bibliothek und ohne Zufall: Feste Werte, damit Server und
 * Client dasselbe rendern (sonst Hydration-Fehler) und die Animation bei
 * jedem Aufruf gleich aussieht.
 */
const CONFETTI = [
  { l: 4, d: 0.0, r: 12, c: '#F59E0B' }, { l: 12, d: 1.1, r: -20, c: '#F87171' },
  { l: 19, d: 0.4, r: 40, c: '#34D399' }, { l: 27, d: 2.0, r: -8, c: '#60A5FA' },
  { l: 35, d: 0.7, r: 25, c: '#FBBF24' }, { l: 43, d: 1.6, r: -35, c: '#A78BFA' },
  { l: 51, d: 0.2, r: 18, c: '#FB7185' }, { l: 59, d: 2.3, r: -14, c: '#4ADE80' },
  { l: 67, d: 0.9, r: 32, c: '#F59E0B' }, { l: 75, d: 1.4, r: -26, c: '#38BDF8' },
  { l: 83, d: 0.5, r: 10, c: '#FBBF24' }, { l: 91, d: 1.9, r: -18, c: '#F472B6' },
]

export default function BirthdayCard({
  cat,
  photos,
}: {
  cat: BirthdayCat
  /** Fotos vom Geburtstag – am Folgetag der kleine Rückblick */
  photos: BirthdayPhoto[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justUploaded, setJustUploaded] = useState(false)

  const year = new Date().getFullYear()

  const takePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)

    const rawExt = file.name.includes('.') ? file.name.split('.').pop()! : 'jpg'
    const ext = rawExt.toLowerCase().replace('heic', 'jpg').replace('heif', 'jpg')

    const { data: upload, error: uploadErr } = await supabase.storage
      .from('joschi-photos')
      .upload(`${cat.id}/${Date.now()}.${ext}`, file, { contentType: file.type })

    if (uploadErr || !upload) {
      setError(uploadErr?.message ?? 'Upload fehlgeschlagen')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('joschi-photos').getPublicUrl(upload.path)

    const res = await fetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storage_path: upload.path,
        public_url: publicUrl,
        mood_tag: 'good',
        caption: `🎂 ${cat.name}s ${cat.age}. Geburtstag`,
        taken_at: new Date().toISOString(),
        cat_ids: [cat.id],
      }),
    })

    setUploading(false)
    if (e.target) e.target.value = ''
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Foto konnte nicht gespeichert werden')
      return
    }
    setJustUploaded(true)
    router.refresh()
  }

  return (
    <div
      className="rounded-3xl relative overflow-hidden"
      style={{ background: cat.gradient, boxShadow: '0 8px 36px rgba(0,0,0,0.22)', padding: 20 }}
    >
      {/* Konfetti nur am Tag selbst – am Folgetag wird es ruhiger */}
      {cat.isToday && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              style={{
                position: 'absolute', top: -14, left: `${c.l}%`,
                width: 7, height: 12, background: c.c, borderRadius: 2,
                transform: `rotate(${c.r}deg)`,
                animation: `bd-fall 3.4s linear ${c.d}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative">
        <div className="flex items-center gap-4">
          {cat.photoUrl && (
            <div style={{ flexShrink: 0, width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', border: '3px solid rgba(255,255,255,0.85)', position: 'relative' }}>
              <Image src={cat.photoUrl} alt="" fill className="object-cover" sizes="60px" />
            </div>
          )}
          <div className="min-w-0">
            <p style={{ color: cat.accent, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {cat.isToday ? '🎂 Heute Geburtstag' : '🎂 Gestern gefeiert'}
            </p>
            <h2 style={{ color: 'white', fontSize: 23, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginTop: 3 }}>
              {cat.isToday
                ? `${cat.name} wird heute ${cat.age}!`
                : `${cat.name} ist ${cat.age} geworden`}
            </h2>
          </div>
        </div>

        {/* Am Geburtstag: Foto machen. Danach: was dabei entstanden ist. */}
        {cat.isToday && (
          <div className="mt-4">
            <label
              className="pressable inline-flex items-center gap-2 cursor-pointer"
              style={{
                background: 'rgba(255,255,255,0.95)', color: '#1C1C1E',
                fontSize: 14, fontWeight: 700, padding: '11px 18px', borderRadius: 14,
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? '⏳ lädt…' : justUploaded ? '📸 Noch eins!' : '📸 Geburtstagsfoto machen'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={takePhoto}
                disabled={uploading}
              />
            </label>
          </div>
        )}

        {photos.length > 0 && (
          <div className="mt-4">
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, marginBottom: 7 }}>
              {photos.length} {photos.length === 1 ? 'Geburtstagsfoto' : 'Geburtstagsfotos'}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.slice(0, 6).map(p => (
                <div key={p.id} style={{ position: 'relative', width: 66, height: 66, flexShrink: 0, borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.7)' }}>
                  <Image src={p.public_url} alt="" fill className="object-cover" sizes="66px" />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p style={{ color: '#FECACA', fontSize: 12, marginTop: 8 }}>⚠ {error}</p>}

        <Link
          href={`/geburtstag?cat=${cat.id}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
            color: 'white', fontSize: 14, fontWeight: 700, textDecoration: 'none',
            background: 'rgba(255,255,255,0.18)', padding: '10px 16px', borderRadius: 14,
          }}
        >
          🎁 {cat.name}s Jahr ansehen
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      <style>{`
        @keyframes bd-fall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          100% { transform: translateY(320px) rotate(420deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes bd-fall { 0%,100% { transform: none; opacity: 0.9; } }
        }
      `}</style>
    </div>
  )
}

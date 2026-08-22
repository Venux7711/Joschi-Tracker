'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { pickActiveCat } from '@/lib/active-cat-client'
import { formatBerlin } from '@/lib/time'
import { readGpsFromFile } from '@/lib/exif'
import PhotoInteractions from '@/components/PhotoInteractions'
import type { Cat } from '@/lib/types'

interface Photo {
  id: string
  public_url: string
  storage_path: string
  mood_tag: string
  caption: string | null
  taken_at: string
  health_log_id: string | null
  /** Markierung, wer auf dem Bild ist – die Bibliothek selbst ist gemeinsam. */
  cat_id: string | null
  /** Mehrere Katzen möglich (z.B. beide auf einem Bild), jederzeit änderbar. */
  cat_ids: string[] | null
  /** Aufnahmeort aus den EXIF-Daten – nur bei Bildern aus der Fotobibliothek. */
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

export default function FotosPage() {
  const supabase = createClient()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Photo | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [cats, setCats] = useState<Cat[]>([])
  const [catId, setCatId] = useState<string | null>(null)
  const [savingTags, setSavingTags] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: catRows } = await supabase.from('cats').select('*').order('created_at', { ascending: true })
      const catList = (catRows ?? []) as Cat[]
      setCats(catList)
      // Aktive Katze nur als Standard-Markierung für neue Uploads – die
      // Bibliothek zeigt immer alle Fotos beider Katzen
      const activeCat = pickActiveCat(catList)
      if (activeCat) setCatId(activeCat.id)
      loadPhotos()
    }
    init()
  }, [])

  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? null

  // Ältere Fotos haben nur die alte Einzelspalte – beide Quellen zusammenführen
  const catTags = (photo: Photo): string[] =>
    photo.cat_ids?.length ? photo.cat_ids : photo.cat_id ? [photo.cat_id] : []

  const tagNames = (photo: Photo) =>
    catTags(photo).map(id => catName(id)).filter((n): n is string => !!n)

  /** Katze auf dem Foto an-/abwählen – speichert sofort. */
  const toggleCatTag = async (photo: Photo, id: string) => {
    const current = catTags(photo)
    const next = current.includes(id) ? current.filter(c => c !== id) : [...current, id]

    setSavingTags(true)
    setTagError(null)
    const res = await fetch('/api/photos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photo.id, cat_ids: next }),
    })
    setSavingTags(false)

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setTagError(data.error ?? 'Markierung konnte nicht gespeichert werden')
      return
    }

    // Die gespeicherte Zeile übernehmen, nicht die Wunschvorstellung: solange
    // Migration 008 fehlt, kann die DB nur eine Katze pro Foto festhalten.
    const saved: Photo = data.photo ?? { ...photo, cat_ids: next, cat_id: next[0] ?? null }
    setPhotos(prev => prev.map(p => (p.id === photo.id ? saved : p)))
    setSelected(saved)

    if (next.length > 1 && catTags(saved).length < next.length) {
      setTagError('Aktuell ist nur eine Katze pro Foto möglich – die Datenbank-Migration steht noch aus.')
    }
  }

  const loadPhotos = async () => {
    setLoading(true)
    const res = await fetch('/api/photos?limit=200')
    const data = await res.json()
    const geladen: Photo[] = data.photos ?? []
    setPhotos(geladen)
    setLoading(false)

    // Aus einer Benachrichtigung heraus wird ?photo=… mitgegeben – dann
    // direkt dieses Bild öffnen, sonst landet man nur irgendwo im Album.
    const gesucht = new URLSearchParams(window.location.search).get('photo')
    if (gesucht) {
      const treffer = geladen.find(p => p.id === gesucht)
      if (treffer) setSelected(treffer)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !catId) return
    setUploading(true)
    setUploadError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const rawExt = file.name.includes('.') ? file.name.split('.').pop()! : 'jpg'
    const ext = rawExt.toLowerCase().replace('heic', 'jpg').replace('heif', 'jpg')
    const path = `${catId}/${Date.now()}.${ext}`

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('joschi-photos')
      .upload(path, file, { contentType: file.type })

    if (uploadErr || !uploadData) {
      setUploadError(uploadErr?.message ?? 'Upload fehlgeschlagen')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('joschi-photos').getPublicUrl(uploadData.path)

    // Aufnahmeort aus den EXIF-Daten – hat längst nicht jedes Bild
    const ort = await readGpsFromFile(file)

    await fetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storage_path: uploadData.path, public_url: publicUrl, mood_tag: 'normal',
        taken_at: new Date().toISOString(),
        // Beim Filtern nach einer Katze wird das Foto auch für diese markiert.
        // Die Markierung lässt sich danach jederzeit im Lightbox ändern.
        cat_ids: [catFilter !== 'all' ? catFilter : catId].filter(Boolean),
        lat: ort?.lat ?? null,
        lng: ort?.lng ?? null,
      }),
    })

    await loadPhotos()
    setUploading(false)
    if (e.target) e.target.value = ''
  }

  const handleDelete = async (photo: Photo) => {
    if (!confirm('Foto löschen?')) return
    const res = await fetch('/api/photos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: photo.id, storage_path: photo.storage_path }) })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setUploadError(data.error ?? 'Löschen fehlgeschlagen')
      return
    }
    setSelected(null)
    await loadPhotos()
  }

  const filtered = photos
    .filter(p => filter === 'all' || p.mood_tag === filter)
    .filter(p => catFilter === 'all' || catTags(p).includes(catFilter))

  const grouped: Record<string, Photo[]> = {}
  filtered.forEach(p => {
    const month = p.taken_at.slice(0, 7)
    if (!grouped[month]) grouped[month] = []
    grouped[month].push(p)
  })

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-')
    const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
    return `${months[parseInt(mo) - 1]} ${y}`
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">← Zurück</Link>
            <h1 className="text-xl font-bold text-gray-800">📸 Fotoalbum</h1>
          </div>
          <div className="flex gap-2">
            {uploading && (
              <span className="text-xs text-amber-600 self-center mr-1">Lädt…</span>
            )}
            <label className={`cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold pressable ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              📷
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            <label className={`cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold pressable ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              🖼️
              <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        {uploadError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm">
            ⚠ {uploadError}
          </div>
        )}

        {/* Katzen-Filter – gemeinsame Bibliothek, optional nach Markierung filtern */}
        {cats.length > 1 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            <button
              onClick={() => setCatFilter('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                catFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
              }`}
            >
              Beide ({photos.length})
            </button>
            {cats.map(c => (
              <button
                key={c.id}
                onClick={() => setCatFilter(c.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  catFilter === c.id ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
                }`}
              >
                🐾 {c.name} ({photos.filter(p => catTags(p).includes(c.id)).length})
              </button>
            ))}
          </div>
        )}

        {/* Stimmungs-Filter */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {['all', 'good', 'normal', 'bad', 'vet'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === f ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300'
              }`}
            >
              {f === 'all' ? 'Alle Stimmungen' : MOOD_LABELS[f]?.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-5xl mb-4">📸</div>
            {photos.length === 0 ? (
              <>
                <p className="text-gray-500 mb-2">Noch keine Fotos</p>
                <p className="text-sm text-gray-400">Tippe oben auf 📷 oder 🖼️ um das erste Bild hinzuzufügen</p>
              </>
            ) : (
              <>
                <p className="text-gray-500 mb-2">Keine Fotos für diesen Filter</p>
                <p className="text-sm text-gray-400">Insgesamt sind {photos.length} Fotos in der Bibliothek</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([month, mphotos]) => (
              <div key={month}>
                <h2 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">{monthLabel(month)}</h2>
                <div className="grid grid-cols-3 gap-2">
                  {mphotos.map(photo => (
                    <button
                      key={photo.id}
                      onClick={() => { setTagError(null); setSelected(photo) }}
                      className="aspect-square relative rounded-xl overflow-hidden group"
                    >
                      <Image src={photo.public_url} alt="" fill className="object-cover transition-transform group-hover:scale-105" sizes="33vw" />
                      {photo.mood_tag !== 'normal' && (
                        <div className={`absolute top-1 right-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${MOOD_LABELS[photo.mood_tag]?.color}`}>
                          {MOOD_LABELS[photo.mood_tag]?.label}
                        </div>
                      )}
                      {photo.lat !== null && (
                        <div
                          className="absolute top-1 left-1 text-[10px] px-1 py-0.5 rounded-full bg-black/45 text-white"
                          title="Mit Ortsangabe"
                        >
                          📍
                        </div>
                      )}
                      {cats.length > 1 && tagNames(photo).length > 0 && (
                        <div className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-black/55 text-white">
                          {tagNames(photo).join(' & ')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div className="relative w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="relative aspect-square w-full rounded-2xl overflow-hidden">
              <Image src={selected.public_url} alt="" fill className="object-contain" sizes="100vw" />
            </div>
            {/* Wer ist auf dem Bild? Antippen zum Ändern – mehrere möglich */}
            {cats.length > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wide text-white/40 font-semibold">
                  Wer ist drauf?
                </span>
                {cats.map(c => {
                  const active = catTags(selected).includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCatTag(selected, c.id)}
                      disabled={savingTags}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors disabled:opacity-50 ${
                        active
                          ? 'bg-amber-500 text-white'
                          : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      {active ? '✓' : '🐾'} {c.name}
                    </button>
                  )
                })}
                {catTags(selected).length === 0 && (
                  <span className="text-xs text-white/40">niemand markiert</span>
                )}
                {savingTags && <span className="text-xs text-white/40">speichert…</span>}
              </div>
            )}

            {tagError && (
              <p className="mt-2 text-xs text-red-300">⚠ {tagError}</p>
            )}

            <div className="flex items-center justify-between mt-3">
              <div>
                <span className={`text-xs px-2 py-1 rounded-full ${MOOD_LABELS[selected.mood_tag]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                  {MOOD_LABELS[selected.mood_tag]?.label ?? selected.mood_tag}
                </span>
                <p className="text-gray-400 text-sm mt-1">
                  {formatBerlin(selected.taken_at, { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => handleDelete(selected)}
                className="text-red-400 hover:text-red-300 text-sm px-3 py-1.5 rounded-lg border border-red-400/30 hover:border-red-400"
              >
                Löschen
              </button>
            </div>
            <PhotoInteractions photoId={selected.id} />

            <button
              onClick={() => setSelected(null)}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

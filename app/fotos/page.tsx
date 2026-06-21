'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'

interface Photo {
  id: string
  public_url: string
  storage_path: string
  mood_tag: string
  caption: string | null
  taken_at: string
  health_log_id: string | null
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
  const [selected, setSelected] = useState<Photo | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [catId, setCatId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: cats } = await supabase.from('cats').select('id').limit(1)
      if (cats?.length) setCatId(cats[0].id)
      loadPhotos()
    }
    init()
  }, [])

  const loadPhotos = async () => {
    setLoading(true)
    const res = await fetch('/api/photos?limit=200')
    const data = await res.json()
    setPhotos(data.photos ?? [])
    setLoading(false)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !catId) return
    setUploading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${catId}/${Date.now()}.${ext}`

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('joschi-photos')
      .upload(path, file, { contentType: file.type })

    if (uploadErr || !uploadData) { setUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('joschi-photos').getPublicUrl(uploadData.path)

    await fetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storage_path: uploadData.path, public_url: publicUrl, mood_tag: 'normal', taken_at: new Date().toISOString() }),
    })

    await loadPhotos()
    setUploading(false)
    if (e.target) e.target.value = ''
  }

  const handleDelete = async (photo: Photo) => {
    if (!confirm('Foto löschen?')) return
    await fetch('/api/photos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: photo.id, storage_path: photo.storage_path }) })
    setSelected(null)
    await loadPhotos()
  }

  const filtered = filter === 'all' ? photos : photos.filter(p => p.mood_tag === filter)

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
            <h1 className="text-xl font-bold text-gray-800">📸 Joschis Fotoalbum</h1>
          </div>
          <div className="flex gap-2">
            <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold pressable">
              📷
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold pressable">
              🖼️
              <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {['all', 'good', 'normal', 'bad', 'vet'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === f ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300'
              }`}
            >
              {f === 'all' ? `Alle (${photos.length})` : MOOD_LABELS[f]?.label}
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
            <p className="text-gray-500 mb-2">Noch keine Fotos</p>
            <p className="text-sm text-gray-400">Tippe auf "+ Foto" um Joschis erstes Bild hinzuzufügen</p>
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
                      onClick={() => setSelected(photo)}
                      className="aspect-square relative rounded-xl overflow-hidden group"
                    >
                      <Image src={photo.public_url} alt="" fill className="object-cover transition-transform group-hover:scale-105" sizes="33vw" />
                      {photo.mood_tag !== 'normal' && (
                        <div className={`absolute top-1 right-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${MOOD_LABELS[photo.mood_tag]?.color}`}>
                          {MOOD_LABELS[photo.mood_tag]?.label}
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
            <div className="flex items-center justify-between mt-3">
              <div>
                <span className={`text-xs px-2 py-1 rounded-full ${MOOD_LABELS[selected.mood_tag]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                  {MOOD_LABELS[selected.mood_tag]?.label ?? selected.mood_tag}
                </span>
                <p className="text-gray-400 text-sm mt-1">
                  {new Date(selected.taken_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => handleDelete(selected)}
                className="text-red-400 hover:text-red-300 text-sm px-3 py-1.5 rounded-lg border border-red-400/30 hover:border-red-400"
              >
                Löschen
              </button>
            </div>
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

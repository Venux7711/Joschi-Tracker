'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCatTheme } from '@/lib/cat-theme'
import type { CatTheme } from '@/lib/types'

export default function CatPhoto({
  src, name, theme, size = 80, editable = false, catId,
}: {
  src: string | null
  name: string
  theme: CatTheme
  size?: number
  /** Zeigt ein Kamera-Badge, über das ein neues Profilbild hochgeladen werden kann. */
  editable?: boolean
  catId?: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [errored, setErrored] = useState(false)
  const [uploading, setUploading] = useState(false)
  // "Gerade hochgeladen"-Vorschau ist an die Katze gebunden, für die hochgeladen
  // wurde – sonst klebt nach dem Umschalten das Bild der anderen Katze am Profil.
  const [localUpload, setLocalUpload] = useState<{ forCatId: string; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const localSrc = localUpload && localUpload.forCatId === catId ? localUpload.url : null
  const effectiveSrc = localSrc ?? src
  // Neues Bild lokal anzeigen → nie erneut als "fehlgeschlagen" behandeln
  const showPhoto = !!effectiveSrc && (!errored || !!localSrc)

  const fallback = (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: getCatTheme(theme).photoGradient, fontSize: size * 0.42 }}
    >
      🐾
    </div>
  )

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !catId) return
    setUploading(true)
    setError(null)

    try {
      const rawExt = file.name.includes('.') ? file.name.split('.').pop()! : 'jpg'
      const ext = rawExt.toLowerCase().replace('heic', 'jpg').replace('heif', 'jpg')
      // Eindeutiger Dateiname statt upsert: braucht nur die INSERT-Policy des Buckets,
      // keine UPDATE-Policy – und wirkt gleichzeitig als Cache-Buster.
      const path = `profile/${catId}-${Date.now()}.${ext}`

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('joschi-photos')
        .upload(path, file, { contentType: file.type })

      if (uploadErr || !uploadData) {
        setError('Upload fehlgeschlagen')
        return
      }

      const { data: { publicUrl } } = supabase.storage.from('joschi-photos').getPublicUrl(uploadData.path)

      const res = await fetch('/api/cats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: catId, photo_url: publicUrl }),
      })
      if (!res.ok) { setError('Speichern fehlgeschlagen'); return }

      setLocalUpload({ forCatId: catId, url: publicUrl })
      setErrored(false)
      router.refresh()
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
      setTimeout(() => setError(null), 3000)
    }
  }

  return (
    <>
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <button
          onClick={() => showPhoto && setOpen(true)}
          style={{ width: size, height: size, cursor: showPhoto ? 'zoom-in' : 'default' }}
          className="relative rounded-full overflow-hidden border-4 border-white/60 shadow-lg block"
          aria-label={`${name} Foto vergrößern`}
        >
          {showPhoto
            ? <img src={effectiveSrc} alt={name} className="w-full h-full object-cover object-top" onError={() => setErrored(true)} />
            : fallback}
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-medium">
              …
            </div>
          )}
        </button>

        {editable && catId && (
          <label
            className="absolute flex items-center justify-center rounded-full cursor-pointer shadow-md"
            style={{
              width: size * 0.34, height: size * 0.34, right: -2, bottom: -2,
              background: error ? '#DC2626' : '#1C1C1E', border: '2px solid white', fontSize: size * 0.16,
            }}
            aria-label={error ? error : `Profilbild für ${name} ändern`}
            title={error ?? undefined}
          >
            {error ? '!' : '📷'}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>

      {open && showPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
        >
          <div className="relative w-full max-w-xs aspect-square rounded-3xl overflow-hidden shadow-2xl">
            <img src={effectiveSrc!} alt={name} className="w-full h-full object-cover object-top" />
          </div>
          <button
            className="absolute top-5 right-5 text-white text-4xl font-thin leading-none"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
      )}
    </>
  )
}

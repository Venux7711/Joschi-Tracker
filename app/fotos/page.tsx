'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { pickActiveCat } from '@/lib/active-cat-client'
import { formatBerlin } from '@/lib/time'
import { readGpsFromFile } from '@/lib/exif'
import { aktuellerOrt, istFrisch } from '@/lib/geolocation'
import { kannKomprimieren, komprimiereVideo, type Fortschritt } from '@/lib/video-compress'
import { merkeProtokoll } from '@/lib/video-debug'
import ProtokollAnzeige from '@/components/ProtokollAnzeige'
import { captureVideoPoster, formatDuration, hasStill, isVideoFile, stillUrl, MAX_VIDEO_BYTES, ZIEL_BYTES } from '@/lib/media'
import PhotoViewer from '@/components/PhotoViewer'
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
  /** Aufgelöster Ortsname, z.B. "Hintermayrstraße, Nürnberg". */
  place: string | null
  /** 'photo' oder 'video' – Videos liegen in derselben Zeitleiste. */
  media_type: string | null
  /** Standbild aus dem Video, für Kachel und alle Stellen die nur Bilder zeigen. */
  poster_url: string | null
  duration_seconds: number | null
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
  // null = wird gerade nicht verkleinert
  const [komprimierung, setKomprimierung] = useState<Fortschritt | null>(null)
  // Das Video muss zum Verkleinern sichtbar laufen – WebKit pausiert sonst
  const videoSlot = useRef<HTMLDivElement>(null)
  // Protokoll des letzten Verkleinerungs-Versuchs, zum Weitergeben. Wird
  // schon während des Laufs gefüllt – ein Hänger soll nicht ungesehen bleiben.
  const [protokoll, setProtokoll] = useState<string | null>(null)
  const abbruch = useRef<AbortController | null>(null)
  // Index statt Objekt: Der Betrachter blättert durch die gefilterte Liste,
  // dafür muss er wissen, an welcher Stelle er steht.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [placeFilter, setPlaceFilter] = useState<string>('all')
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
  // Nur die beiden Markierungs-Felder verlangen – so lässt sich die Funktion
  // auch mit den Fotos aus dem Betrachter benutzen
  const catTags = (photo: { cat_id: string | null; cat_ids: string[] | null }): string[] =>
    photo.cat_ids?.length ? photo.cat_ids : photo.cat_id ? [photo.cat_id] : []

  const tagNames = (photo: Photo) =>
    catTags(photo).map(id => catName(id)).filter((n): n is string => !!n)

  /** Katze auf dem Foto an-/abwählen – speichert sofort. */
  const toggleCatTag = async (photo: { id: string; cat_id: string | null; cat_ids: string[] | null }, id: string) => {
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

    if (next.length > 1 && catTags(saved).length < next.length) {
      setTagError('Aktuell ist nur eine Katze pro Foto möglich – die Datenbank-Migration steht noch aus.')
    }
  }

  /**
   * Ort nachtragen – vom Gerät, für ein Bild das keinen hat.
   *
   * Der Fall, für den das gedacht ist: Man ist mit den Katzen woanders, hat
   * schon fotografiert, und die Bilder haben keinen Ort, weil die App-Kamera
   * keinen mitliefert. Solange man noch dort ist, stimmt der Gerätestandort.
   */
  const ortNachtragen = async (photo: { id: string }) => {
    setTagError(null)
    setSavingTags(true)
    const ort = await aktuellerOrt()
    if (!ort) {
      setSavingTags(false)
      setTagError('Kein Standort verfügbar – Ortungsdienste für den Browser erlauben und nochmal versuchen.')
      return
    }

    const res = await fetch('/api/photos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photo.id, lat: ort.lat, lng: ort.lng }),
    })
    setSavingTags(false)

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setTagError(data.error ?? 'Ort konnte nicht gespeichert werden')
      return
    }
    setPhotos(prev => prev.map(p => (p.id === photo.id ? (data.photo ?? p) : p)))
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
      const pos = geladen.findIndex(p => p.id === gesucht)
      if (pos >= 0) setViewerIndex(pos)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !catId) return
    setUploading(true)
    setUploadError(null)
    setProtokoll(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const video = isVideoFile(file)

    // Zu groß? Erst verkleinern, statt den Nutzer zurückzuschicken. Das läuft
    // in Echtzeit – deshalb die Fortschrittsanzeige, sonst sähe es aus, als
    // hinge die App.
    let datei = file
    if (video && file.size > MAX_VIDEO_BYTES) {
      if (!kannKomprimieren()) {
        setUploadError(
          `Das Video ist ${Math.round(file.size / 1024 / 1024)} MB groß – mehr als ` +
          `${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB gehen nicht, und dieser Browser ` +
          'kann Videos nicht verkleinern. In der Fotos-App kürzen und nochmal versuchen.'
        )
        setUploading(false)
        if (e.target) e.target.value = ''
        return
      }

      // Erst die Karte einblenden, dann zwei Bilder warten – vorher gibt es
      // den Platz für das Video noch nicht, in den es gehängt werden muss.
      setKomprimierung({ schritt: 'Vorbereiten', anteil: null })
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

      abbruch.current = new AbortController()
      const ergebnis = await komprimiereVideo(file, ZIEL_BYTES, {
        halter: videoSlot.current,
        onFortschritt: setKomprimierung,
        // Laufend mitschreiben und sofort wegsichern: Wer die App schließt,
        // während es hängt, findet das Protokoll danach in den Einstellungen.
        onProtokoll: text => { setProtokoll(text); merkeProtokoll(text) },
        signal: abbruch.current.signal,
      })
      abbruch.current = null
      setKomprimierung(null)

      // Immer aufheben, auch bei Erfolg: Ein gelungener Durchlauf zeigt, wie
      // es aussehen soll, und das hilft beim Vergleich mit einem misslungenen.
      setProtokoll(ergebnis.protokoll)
      merkeProtokoll(ergebnis.protokoll)

      if (ergebnis.ok) {
        datei = ergebnis.file
      } else {
        setUploadError(
          ergebnis.grund === 'abgebrochen'
            ? 'Verkleinern abgebrochen. Das Protokoll unten zeigt, wie weit es kam.'
          : ergebnis.grund === 'zu_lang'
            ? 'Das Video ist zu lang, um es auf eine brauchbare Größe zu bringen. ' +
              'In der Fotos-App kürzen (Bearbeiten → Enden zusammenschieben) und nochmal versuchen.'
            : ergebnis.grund === 'kein_gewinn'
              ? 'Das Video ließ sich nicht kleiner machen. Bitte in der Fotos-App kürzen.'
              : ergebnis.grund === 'wiedergabe_stockt'
                ? 'Das Verkleinern kam nicht durch – dem Handy fehlt für dieses Video die Puste. ' +
                  'Andere Apps schließen hilft manchmal; sicher hilft Kürzen in der Fotos-App ' +
                  `(Bearbeiten → Enden zusammenschieben). (${ergebnis.schritt})`
              : ergebnis.grund === 'keine_wiedergabe'
                ? 'Das Video ließ sich zum Verkleinern nicht abspielen. Bei aktivem Stromsparmodus ' +
                  'blockiert das iPhone die Wiedergabe – ausschalten und nochmal versuchen. ' +
                  `Sonst hilft Kürzen in der Fotos-App. (Schritt: ${ergebnis.schritt})`
                : 'Das Verkleinern hat nicht geklappt. Bitte das Video in der Fotos-App kürzen ' +
                  `und nochmal versuchen. (Schritt: ${ergebnis.schritt})`
        )
        setUploading(false)
        if (e.target) e.target.value = ''
        return
      }
    }

    const rawExt = datei.name.includes('.') ? datei.name.split('.').pop()! : video ? 'mp4' : 'jpg'
    const ext = rawExt.toLowerCase().replace('heic', 'jpg').replace('heif', 'jpg')
    const basis = `${catId}/${Date.now()}`

    // Standbild aus dem Video greifen, solange die Datei noch im Browser liegt.
    // Danach ginge es nur noch serverseitig, und dafür bräuchte es ffmpeg.
    const standbild = video ? await captureVideoPoster(datei) : null

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('joschi-photos')
      .upload(`${basis}.${ext}`, datei, { contentType: datei.type || (video ? 'video/mp4' : undefined) })

    if (uploadErr || !uploadData) {
      setUploadError(
        /exceed|too large|maximum/i.test(uploadErr?.message ?? '')
          ? 'Die Datei ist zu groß für den Speicher. Bitte das Video kürzen.'
          : uploadErr?.message ?? 'Upload fehlgeschlagen'
      )
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('joschi-photos').getPublicUrl(uploadData.path)

    // Standbild als eigene Datei daneben legen. Scheitert das, wird das Video
    // trotzdem gespeichert – dann eben ohne Vorschaubild.
    let posterUrl: string | null = null
    let posterPath: string | null = null
    if (standbild?.blob) {
      const ziel = `${basis}-poster.jpg`
      const { data: pd } = await supabase.storage
        .from('joschi-photos')
        .upload(ziel, standbild.blob, { contentType: 'image/jpeg' })
      if (pd) {
        posterPath = pd.path
        posterUrl = supabase.storage.from('joschi-photos').getPublicUrl(pd.path).data.publicUrl
      }
    }

    // Aufnahmeort: zuerst aus dem Bild selbst – das ist der echte Ort der
    // Aufnahme. Videos speichern ihn in einem anderen Format, das hier nicht
    // gelesen wird.
    const ausDatei = video ? null : await readGpsFromFile(file)

    // Nichts im Bild? Dann den Gerätestandort nehmen – aber nur bei frischen
    // Aufnahmen. Ein Bild aus der App-Kamera hat nie Koordinaten, und ohne
    // diesen Ersatz bliebe der Ort für den Großteil der Fotos leer. Bei einem
    // alten Bild aus der Fotobibliothek wäre "wo bin ich jetzt" dagegen
    // schlicht falsch.
    const ort = ausDatei ?? (istFrisch(file) ? await aktuellerOrt() : null)

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
        media_type: video ? 'video' : 'photo',
        poster_url: posterUrl,
        poster_path: posterPath,
        duration_seconds: standbild?.duration ?? null,
      }),
    })

    await loadPhotos()
    setUploading(false)
    if (e.target) e.target.value = ''
  }

  const handleDelete = async (photo: { id: string; storage_path: string; media_type?: string | null }) => {
    if (!confirm(photo.media_type === 'video' ? 'Video löschen?' : 'Foto löschen?')) return
    const res = await fetch('/api/photos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: photo.id, storage_path: photo.storage_path }) })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setUploadError(data.error ?? 'Löschen fehlgeschlagen')
      return
    }
    setViewerIndex(null)
    await loadPhotos()
  }

  /**
   * Orte mit Anzahl und Zeitraum – das beantwortet "wo waren die Katzen wann".
   * Gruppiert wird über den aufgelösten Namen: Aufnahmen im selben Haus haben
   * leicht abweichende Koordinaten, landen aber auf derselben Straße.
   */
  const places = (() => {
    const map = new Map<string, { count: number; von: string; bis: string }>()
    for (const p of photos) {
      if (!p.place) continue
      const tag = p.taken_at.slice(0, 10)
      const e = map.get(p.place)
      if (!e) map.set(p.place, { count: 1, von: tag, bis: tag })
      else {
        e.count++
        if (tag < e.von) e.von = tag
        if (tag > e.bis) e.bis = tag
      }
    }
    return Array.from(map, ([name, v]) => ({ name, ...v })).sort((a, b) => b.bis.localeCompare(a.bis))
  })()

  const filtered = photos
    .filter(p => filter === 'all' || p.mood_tag === filter)
    .filter(p => catFilter === 'all' || catTags(p).includes(catFilter))
    .filter(p => placeFilter === 'all' || p.place === placeFilter)

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
              <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            <label className={`cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold pressable ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              🖼️
              <input ref={galleryRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Das Verkleinern läuft in Echtzeit – ohne Anzeige sähe es aus, als
            hinge die App. Der Hinweis auf die Dauer nimmt die Ungeduld raus. */}
        {komprimierung !== null && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50">
            <div className="flex gap-3">
              {/* Hier läuft das Video durch. Es muss wirklich zu sehen sein:
                  WebKit pausiert stumme Videos, die es für unsichtbar hält. */}
              <div
                ref={videoSlot}
                className="rounded-lg overflow-hidden flex-shrink-0"
                style={{ width: 64, height: 64, background: 'rgba(180,83,9,0.12)' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-amber-800 font-medium truncate">
                    {komprimierung.anteil === null
                      ? `${komprimierung.schritt}…`
                      : `Wird verkleinert… ${Math.round(komprimierung.anteil * 100)} %`}
                  </p>
                  <span className="text-xs text-amber-600 flex-shrink-0">Offen lassen</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(180,83,9,0.15)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: komprimierung.anteil === null ? '8%' : `${Math.round(komprimierung.anteil * 100)}%`,
                      background: 'var(--am-500, #f59e0b)',
                      transition: 'width 0.3s',
                      opacity: komprimierung.anteil === null ? 0.5 : 1,
                    }}
                  />
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-xs text-amber-700">
                    Dauert ungefähr so lange, wie das Video läuft.
                  </p>
                  {/* Abbrechen statt warten: Hängt es, dauerte es bisher bis
                      zu zwei Minuten, bis überhaupt etwas zu sehen war. */}
                  <button
                    onClick={() => abbruch.current?.abort()}
                    className="text-xs font-semibold flex-shrink-0"
                    style={{ color: '#B45309', textDecoration: 'underline' }}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>

            {/* Schon während des Laufens einsehbar – wer nicht warten will,
                kann den Stand jederzeit kopieren und weitergeben. */}
            {protokoll && <ProtokollAnzeige text={protokoll} titel="Protokoll (läuft mit)" />}
          </div>
        )}

        {uploadError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm">
            ⚠ {uploadError}
            {protokoll && (
              <>
                <p style={{ marginTop: 8, fontSize: 12 }}>
                  Schick mir das Protokoll, dann sehe ich die Ursache statt sie zu raten.
                </p>
                <ProtokollAnzeige text={protokoll} />
              </>
            )}
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

        {/* Orte – nur zeigen, wenn es überhaupt welche gibt. Bei nur einem
            Ort wäre ein Filter sinnlos, die Zeile informiert dann bloß. */}
        {places.length > 0 && (
          <div className="mb-3">
            <div className="flex gap-2 flex-wrap items-center">
              {places.length > 1 && (
                <button
                  onClick={() => setPlaceFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    placeFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                >
                  Alle Orte
                </button>
              )}
              {places.map(pl => (
                <button
                  key={pl.name}
                  onClick={() => setPlaceFilter(placeFilter === pl.name ? 'all' : pl.name)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors text-left ${
                    placeFilter === pl.name ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
                  }`}
                >
                  📍 {pl.name}
                  <span className={placeFilter === pl.name ? 'opacity-70' : 'text-gray-400'}>
                    {' '}· {pl.count}
                  </span>
                </button>
              ))}
            </div>
            {places.map(pl => (
              placeFilter === pl.name && (
                <p key={pl.name} className="text-xs text-gray-500 mt-2">
                  {pl.count} {pl.count === 1 ? 'Foto' : 'Fotos'} ·{' '}
                  {pl.von === pl.bis
                    ? formatBerlin(`${pl.von}T12:00:00`, { day: 'numeric', month: 'long', year: 'numeric' })
                    : `${formatBerlin(`${pl.von}T12:00:00`, { day: 'numeric', month: 'short' })} bis ${formatBerlin(`${pl.bis}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </p>
              )
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
          <div className="grid grid-cols-3 gap-1 -mx-4 sm:mx-0">
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
                <p className="text-sm text-gray-400">Tippe oben auf 📷 oder 🖼️ um das erste Bild oder Video hinzuzufügen</p>
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
                {/* Randlos und mit schmalen Fugen: In drei Spalten mit
                    Seitenrand blieben auf dem Handy nur rund 110 px pro Bild. */}
                <div className="grid grid-cols-3 gap-1 -mx-4 sm:mx-0">
                  {mphotos.map(photo => (
                    <button
                      key={photo.id}
                      onClick={() => { setTagError(null); setViewerIndex(filtered.findIndex(p => p.id === photo.id)) }}
                      className="aspect-square relative overflow-hidden group sm:rounded-xl"
                    >
                      {hasStill(photo) ? (
                        <Image src={stillUrl(photo)} alt="" fill className="object-cover transition-transform group-hover:scale-105" sizes="33vw" />
                      ) : (
                        // Video, aus dem sich kein Standbild greifen ließ – ein
                        // <Image> mit einer .mp4-Adresse bliebe hier leer.
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#2C2C2E' }}>
                          <span style={{ fontSize: 22 }}>🎬</span>
                        </div>
                      )}
                      {photo.media_type === 'video' && (
                        <>
                          {/* Abspiel-Zeichen mittig: Ohne das ist eine
                              Video-Kachel von einem Foto nicht zu unterscheiden */}
                          <div
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            aria-hidden
                          >
                            <span
                              className="flex items-center justify-center rounded-full"
                              style={{
                                width: 34, height: 34, background: 'rgba(0,0,0,0.45)',
                                color: 'white', fontSize: 13, paddingLeft: 3,
                              }}
                            >
                              ▶
                            </span>
                          </div>
                          {formatDuration(photo.duration_seconds) && (
                            <div className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded-md bg-black/60 text-white font-medium tabular-nums">
                              {formatDuration(photo.duration_seconds)}
                            </div>
                          )}
                        </>
                      )}
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

      {viewerIndex !== null && (
        <PhotoViewer
          photos={filtered}
          index={viewerIndex}
          cats={cats}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onToggleTag={toggleCatTag}
          onAddPlace={ortNachtragen}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

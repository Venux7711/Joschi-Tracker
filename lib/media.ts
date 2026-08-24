/**
 * Fotos und Videos liegen in derselben Tabelle. Diese Datei beantwortet die
 * beiden Fragen, die überall in der App auftauchen: Ist das ein Video, und
 * welches Standbild zeige ich dafür?
 */

/** Was zum Anzeigen mindestens nötig ist – bewusst schmal gehalten. */
export type MediaLike = {
  public_url: string
  media_type?: string | null
  poster_url?: string | null
  duration_seconds?: number | null
}

/** 100 MB. Darüber weist der Storage-Bucket den Upload ohnehin ab. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024

/**
 * Zielgröße beim Verkleinern. Bewusst deutlich unter der Grenze: Die Aufnahme
 * trifft eine vorgegebene Datenrate nur ungefähr, und ein Ergebnis, das knapp
 * darüber landet, wäre nach minutenlangem Rechnen doppelt ärgerlich.
 */
export const ZIEL_BYTES = 70 * 1024 * 1024

export function isVideo(row: MediaLike | null | undefined): boolean {
  return row?.media_type === 'video'
}

/**
 * Das Bild, das an Stellen gezeigt wird, die nur Standbilder darstellen –
 * Raster, Collage, Erinnerung des Tages, Geburtstagsseite.
 */
export function stillUrl(row: MediaLike): string {
  return isVideo(row) ? (row.poster_url ?? row.public_url) : row.public_url
}

/**
 * Ein Video ohne Standbild kann an diesen Stellen nicht dargestellt werden –
 * ein <img> mit einer .mp4-Adresse bleibt leer. Solche Einträge werden dort
 * übersprungen statt kaputt angezeigt.
 */
export function hasStill(row: MediaLike): boolean {
  return !isVideo(row) || !!row.poster_url
}

/** 0:07, 1:23, 12:05 */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null
  const gesamt = Math.round(seconds)
  return `${Math.floor(gesamt / 60)}:${String(gesamt % 60).padStart(2, '0')}`
}

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  // Ältere Android-Browser lassen den MIME-Typ bei .mov gelegentlich leer
  return /\.(mp4|mov|m4v|webm|3gp|avi|mkv)$/i.test(file.name)
}

/**
 * Greift ein Standbild aus dem Video – im Browser, bevor hochgeladen wird.
 *
 * Warum überhaupt: Ohne Standbild wäre die Kachel im Album schwarz, und die
 * Collage und die Erinnerung des Tages könnten Videos gar nicht zeigen.
 *
 * Warum nicht Sekunde 0: Der erste Frame ist bei Handyaufnahmen oft noch
 * dunkel, weil die Belichtung nachzieht. Ein halbe Sekunde später sieht man
 * meistens schon die Katze.
 *
 * Schlägt es fehl – etwa weil der Browser den Codec nicht dekodieren kann –
 * gibt die Funktion null zurück. Der Upload läuft dann trotzdem, das Video
 * ist nur nicht überall sichtbar.
 */
export async function captureVideoPoster(
  file: File,
): Promise<{ blob: Blob | null; duration: number | null }> {
  if (typeof document === 'undefined') return { blob: null, duration: null }

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('muted', '')
  // Ohne das liefert canvas.toBlob bei Videos von fremder Herkunft nichts.
  // Bei einer blob:-Adresse ist das unkritisch, schadet aber auch nicht.
  video.crossOrigin = 'anonymous'
  video.src = url
  // Ins Dokument hängen: Safari dekodiert ein Video, das nur im Speicher
  // existiert, nicht zuverlässig – dann bleibt das Standbild leer. Versteckt
  // über die Größe, nicht über display:none, das hätte denselben Effekt.
  video.style.cssText =
    'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1'
  document.body.appendChild(video)

  /** Wartet auf ein Ereignis, gibt nach n ms auf statt hängen zu bleiben. */
  const warteAuf = (ereignis: string, ms: number) =>
    new Promise<boolean>(fertig => {
      let erledigt = false
      const ok = () => { if (!erledigt) { erledigt = true; aufraeumen(); fertig(true) } }
      const fehler = () => { if (!erledigt) { erledigt = true; aufraeumen(); fertig(false) } }
      const uhr = setTimeout(fehler, ms)
      const aufraeumen = () => {
        clearTimeout(uhr)
        video.removeEventListener(ereignis, ok)
        video.removeEventListener('error', fehler)
      }
      video.addEventListener(ereignis, ok, { once: true })
      video.addEventListener('error', fehler, { once: true })
    })

  try {
    if (!(await warteAuf('loadedmetadata', 15_000))) return { blob: null, duration: null }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null

    // Auf eine Stelle springen, an der schon etwas zu sehen ist
    const ziel = duration ? Math.min(0.5, duration / 2) : 0
    video.currentTime = ziel
    if (!(await warteAuf('seeked', 10_000))) return { blob: null, duration }

    // Safari auf dem iPhone hat den Frame nach 'seeked' nicht immer schon
    // dekodiert; 'loadeddata' bestätigt das.
    if (video.readyState < 2) await warteAuf('loadeddata', 5_000)

    const breite = video.videoWidth
    const hoehe = video.videoHeight
    if (!breite || !hoehe) return { blob: null, duration }

    // Auf 1080 px lange Kante herunterrechnen – als Kachel und Vorschau reicht
    // das, und die Datei bleibt klein.
    const faktor = Math.min(1, 1080 / Math.max(breite, hoehe))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(breite * faktor)
    canvas.height = Math.round(hoehe * faktor)

    const ctx = canvas.getContext('2d')
    if (!ctx) return { blob: null, duration }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>(fertig =>
      canvas.toBlob(b => fertig(b), 'image/jpeg', 0.82),
    )
    return { blob, duration }
  } catch {
    return { blob: null, duration: null }
  } finally {
    video.removeAttribute('src')
    try { video.load() } catch { /* egal */ }
    video.remove()
    URL.revokeObjectURL(url)
  }
}

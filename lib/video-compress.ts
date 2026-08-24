/**
 * Videos im Browser verkleinern, bevor sie hochgeladen werden.
 *
 * Warum überhaupt im Browser: Der Upload geht direkt vom Gerät zu Supabase,
 * die eigene Serverseite sieht die Datei nie. Serverseitig umzurechnen hieße,
 * die Datei erst hochzuladen – also genau das, was hier verhindert werden soll.
 *
 * Wie: Das Video wird abgespielt, Bild für Bild auf eine kleinere Leinwand
 * gezeichnet und von dort mit begrenzter Datenrate neu aufgenommen. Der Ton
 * läuft über die Audio-Verarbeitung des Browsers mit.
 *
 * Der Preis, und der ist der Grund für die Fortschrittsanzeige: Das läuft in
 * Echtzeit. Ein Video von zwei Minuten braucht zwei Minuten. Schneller
 * abspielen geht nicht – die Aufnahme folgt der Uhr, das Ergebnis wäre ein
 * Video im Zeitraffer.
 */

/** Längste Kante des Ergebnisses. 720p reicht für ein Familienalbum völlig. */
const MAX_KANTE = 1280

/** Unter dieser Datenrate wird das Bild matschig – dann lieber ehrlich abbrechen. */
const MIN_BITRATE = 600_000
const MAX_BITRATE = 5_000_000
const TON_BITRATE = 96_000

/**
 * Reihenfolge nach Verträglichkeit: MP4 spielt überall, WebM nicht auf jedem
 * iPhone. Safari liefert MP4, Chrome meist WebM – genommen wird das erste,
 * was das Gerät kann.
 */
const FORMATE = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export type Komprimierergebnis =
  | { ok: true; file: File }
  | { ok: false; grund: 'nicht_unterstuetzt' | 'zu_lang' | 'fehlgeschlagen' | 'kein_gewinn' }

function waehleFormat(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return FORMATE.find(f => MediaRecorder.isTypeSupported(f)) ?? null
}

/** Kann dieses Gerät überhaupt umrechnen? */
export function kannKomprimieren(): boolean {
  if (typeof document === 'undefined') return false
  if (waehleFormat() === null) return false
  const c = document.createElement('canvas')
  return typeof (c as HTMLCanvasElement & { captureStream?: unknown }).captureStream === 'function'
}

/**
 * Rechnet die Datenrate so aus, dass das Ergebnis unter die Zielgröße passt.
 * 88 % statt 100 %, weil Container und Ton zusätzlich Platz brauchen und die
 * Aufnahme die Vorgabe nur ungefähr trifft.
 */
export function zielBitrate(zielBytes: number, dauerSekunden: number): number | null {
  if (!dauerSekunden || dauerSekunden <= 0) return null
  const gesamt = (zielBytes * 8 * 0.88) / dauerSekunden - TON_BITRATE
  if (gesamt < MIN_BITRATE) return null
  return Math.min(MAX_BITRATE, Math.floor(gesamt))
}

export async function komprimiereVideo(
  file: File,
  zielBytes: number,
  onFortschritt?: (anteil: number) => void,
): Promise<Komprimierergebnis> {
  const format = waehleFormat()
  if (!format || !kannKomprimieren()) return { ok: false, grund: 'nicht_unterstuetzt' }

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = url
  video.preload = 'auto'
  video.playsInline = true

  let audioCtx: AudioContext | null = null
  let recorder: MediaRecorder | null = null
  let laufendeAnimation = 0

  const aufraeumen = () => {
    cancelAnimationFrame(laufendeAnimation)
    try { recorder?.stream.getTracks().forEach(t => t.stop()) } catch { /* egal */ }
    try { audioCtx?.close() } catch { /* egal */ }
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }

  try {
    const bereit = await new Promise<boolean>(fertig => {
      const uhr = setTimeout(() => fertig(false), 20_000)
      video.addEventListener('loadedmetadata', () => { clearTimeout(uhr); fertig(true) }, { once: true })
      video.addEventListener('error', () => { clearTimeout(uhr); fertig(false) }, { once: true })
    })
    if (!bereit) { aufraeumen(); return { ok: false, grund: 'fehlgeschlagen' } }

    const dauer = video.duration
    const bitrate = zielBitrate(zielBytes, dauer)
    // Zu lang: Selbst bei gerade noch ansehbarer Qualität passt es nicht.
    // Das ehrlich zu sagen ist besser, als einen Klumpen Pixel abzuliefern.
    if (bitrate === null) { aufraeumen(); return { ok: false, grund: 'zu_lang' } }

    const faktor = Math.min(1, MAX_KANTE / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    // Gerade Kantenlängen: Ungerade Werte mag kein H.264-Encoder
    canvas.width = Math.round((video.videoWidth * faktor) / 2) * 2
    canvas.height = Math.round((video.videoHeight * faktor) / 2) * 2
    const ctx = canvas.getContext('2d')
    if (!ctx || !canvas.width || !canvas.height) { aufraeumen(); return { ok: false, grund: 'fehlgeschlagen' } }

    const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream })
      .captureStream(30)

    // Ton mitnehmen. Der Weg über die Audio-Verarbeitung ist nötig, weil ein
    // Video-Element seine Tonspur nicht direkt herausgibt. Verbunden wird nur
    // mit dem Aufnahme-Ziel, nicht mit den Lautsprechern – sonst würde beim
    // Verkleinern das halbe Video laut abgespielt.
    let mitTon = false
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      const quelle = audioCtx.createMediaElementSource(video)
      const ziel = audioCtx.createMediaStreamDestination()
      quelle.connect(ziel)
      for (const spur of ziel.stream.getAudioTracks()) stream.addTrack(spur)
      mitTon = ziel.stream.getAudioTracks().length > 0
    } catch {
      // Ohne Ton weiterzumachen ist besser als gar nicht zu verkleinern
      mitTon = false
    }

    const teile: Blob[] = []
    recorder = new MediaRecorder(stream, {
      mimeType: format,
      videoBitsPerSecond: bitrate,
      ...(mitTon ? { audioBitsPerSecond: TON_BITRATE } : {}),
    })
    recorder.ondataavailable = e => { if (e.data.size > 0) teile.push(e.data) }

    const fertigGestellt = new Promise<void>(fertig => {
      recorder!.addEventListener('stop', () => fertig(), { once: true })
    })

    recorder.start(1000)

    try {
      await video.play()
    } catch {
      // Ohne Abspielerlaubnis kommt kein einziges Bild zustande
      aufraeumen()
      return { ok: false, grund: 'fehlgeschlagen' }
    }

    const zeichne = () => {
      if (video.ended || video.paused) return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      if (dauer > 0) onFortschritt?.(Math.min(1, video.currentTime / dauer))
      laufendeAnimation = requestAnimationFrame(zeichne)
    }
    laufendeAnimation = requestAnimationFrame(zeichne)

    await new Promise<void>(fertig => {
      video.addEventListener('ended', () => fertig(), { once: true })
      // Notbremse: Läuft die Wiedergabe irgendwo fest, soll der Upload nicht
      // ewig hängen. Großzügig bemessen, weil Echtzeit die Untergrenze ist.
      setTimeout(() => fertig(), (dauer + 30) * 1000)
    })

    cancelAnimationFrame(laufendeAnimation)
    if (recorder.state !== 'inactive') recorder.stop()
    await fertigGestellt

    const blob = new Blob(teile, { type: format.split(';')[0] })
    aufraeumen()

    if (blob.size === 0) return { ok: false, grund: 'fehlgeschlagen' }
    // Nichts gewonnen? Dann lieber das Original behalten – das hat wenigstens
    // die volle Qualität.
    if (blob.size >= file.size) return { ok: false, grund: 'kein_gewinn' }

    const endung = format.startsWith('video/mp4') ? 'mp4' : 'webm'
    const basis = file.name.replace(/\.[^.]+$/, '') || 'video'
    onFortschritt?.(1)
    return { ok: true, file: new File([blob], `${basis}.${endung}`, { type: blob.type }) }
  } catch {
    aufraeumen()
    return { ok: false, grund: 'fehlgeschlagen' }
  }
}

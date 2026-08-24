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

// Bewusst relativ: Diese Datei wird für den Testlauf einzeln übersetzt, und
// dort gibt es die @/-Abkürzung aus tsconfig.json nicht.
import { Protokoll } from './video-debug'

/** Längste Kante des Ergebnisses. 720p reicht für ein Familienalbum völlig. */
const MAX_KANTE = 1280

/** Unter dieser Datenrate wird das Bild matschig – dann lieber ehrlich abbrechen. */
const MIN_BITRATE = 600_000
const MAX_BITRATE = 5_000_000
const TON_BITRATE = 96_000

/**
 * So lange wird auf das erste Bild gewartet, bevor der Versuch als tot gilt.
 *
 * Großzügig bemessen: Ein 200-MB-Video muss erst so weit gepuffert sein, dass
 * die Wiedergabe anlaufen kann, und das dauert auf dem Handy spürbar. Acht
 * Sekunden waren zu knapp.
 */
const ANLAUF_MS = 30_000

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

export type Komprimiergrund =
  | 'nicht_unterstuetzt'
  | 'zu_lang'
  | 'keine_wiedergabe'
  | 'wiedergabe_stockt'
  | 'fehlgeschlagen'
  | 'kein_gewinn'

/**
 * So lange darf die Wiedergabe stillstehen, bevor sie als hängend gilt.
 *
 * Der Fall, für den das da ist: Das Handy dekodiert 4K, skaliert es und
 * kodiert gleichzeitig neu. Reicht die Rechenleistung nicht, läuft das Video
 * kurz an und bleibt dann stehen. Ohne diese Erkennung würde bis zum
 * Not-Timeout gewartet und am Ende ein abgeschnittenes Video hochgeladen –
 * das wäre schlimmer als ein ehrlicher Abbruch.
 */
const STOCKT_MS = 15_000

export type Komprimierergebnis =
  | { ok: true; file: File; mitTon: boolean; protokoll: string }
  | { ok: false; grund: Komprimiergrund; schritt: string; protokoll: string }

/**
 * Rückmeldung an die Oberfläche. Der Schritt steht dabei, weil "bleibt bei
 * 0 % stehen" nichts darüber verrät, woran es liegt – laden, abspielen und
 * aufnehmen scheitern unterschiedlich und brauchen unterschiedliche Abhilfe.
 */
export type Fortschritt = { schritt: string; anteil: number | null }

export type Optionen = {
  /** Wohin das Video zum Durchlaufen gehängt wird. Muss sichtbar sein. */
  halter?: HTMLElement | null
  onFortschritt?: (f: Fortschritt) => void
}

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

/**
 * Erzeugt das Video-Element für einen Versuch.
 *
 * Zwei Bedingungen, an denen es auf dem iPhone nacheinander gescheitert ist:
 *
 * Erstens muss das Element im Dokument hängen. Ein Video, das nur im Speicher
 * existiert, spielt Safari nicht ab – ohne Fehlermeldung, die Wiedergabe
 * bleibt einfach bei 0:00.
 *
 * Zweitens muss es sichtbar sein. WebKit pausiert stumme Videos, die außerhalb
 * des Sichtbereichs liegen oder praktisch durchsichtig sind – eine Regel gegen
 * versteckt laufende Werbung. Ein 2×2-Pixel-Element mit 1 % Deckkraft fällt
 * genau darunter. Deshalb wird es echt angezeigt, klein und in der
 * Fortschrittskarte: Man sieht das Video durchlaufen, während es verkleinert
 * wird, und WebKit ist zufrieden.
 */
function baueVideoElement(url: string, stumm: boolean, halter: HTMLElement | null): HTMLVideoElement {
  const video = document.createElement('video')
  video.src = url
  video.preload = 'auto'
  video.muted = stumm
  video.playsInline = true
  // Als Attribut zusätzlich zur Eigenschaft – ältere WebKit-Fassungen lesen nur das
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  if (stumm) video.setAttribute('muted', '')

  if (halter) {
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'
    halter.replaceChildren(video)
  } else {
    // Notlösung ohne Platz in der Oberfläche: wenigstens im sichtbaren Bereich
    // und groß genug, dass WebKit es als sichtbar zählt.
    video.style.cssText =
      'position:fixed;right:4px;bottom:4px;width:64px;height:64px;object-fit:cover;z-index:60'
    document.body.appendChild(video)
  }
  return video
}

/** Wartet auf ein Ereignis am Element, gibt nach ms auf. */
function warteAuf(el: HTMLVideoElement, ereignis: string, ms: number): Promise<boolean> {
  return new Promise(fertig => {
    let erledigt = false
    const ende = (wert: boolean) => {
      if (erledigt) return
      erledigt = true
      clearTimeout(uhr)
      el.removeEventListener(ereignis, ok)
      el.removeEventListener('error', fehler)
      fertig(wert)
    }
    const ok = () => ende(true)
    const fehler = () => ende(false)
    const uhr = setTimeout(() => ende(false), ms)
    el.addEventListener(ereignis, ok, { once: true })
    el.addEventListener('error', fehler, { once: true })
  })
}

/**
 * Ein Durchlauf. Steckt in einer eigenen Funktion, weil der Ton-Versuch
 * scheitern kann und dann ein zweiter Anlauf ohne Ton nötig ist – und weil
 * createMediaElementSource pro Element nur einmal aufgerufen werden darf,
 * muss dafür alles neu aufgebaut werden.
 */
async function versuch(
  file: File,
  zielBytes: number,
  mitTonVersuchen: boolean,
  opt: Optionen,
  log: Protokoll,
): Promise<Komprimierergebnis> {
  const melde = (schritt: string, anteil: number | null) => opt.onFortschritt?.({ schritt, anteil })
  const raus = (grund: Komprimiergrund, schritt: string): Komprimierergebnis => {
    log.add('ABBRUCH', { grund, schritt })
    return { ok: false, grund, schritt, protokoll: log.text() }
  }

  log.add('--- Versuch', { mitTon: mitTonVersuchen })
  log.add('Formate', FORMATE.map(f => `${f.split(';')[0]}:${MediaRecorder.isTypeSupported(f) ? 'ja' : 'nein'}`).join(' '))

  const format = waehleFormat()
  if (!format) return raus('nicht_unterstuetzt', 'Format prüfen')
  log.add('Format gewählt', format)

  const url = URL.createObjectURL(file)
  // Ohne Ton wird stumm abgespielt: Das erlaubt jeder Browser ohne Rückfrage.
  // Mit Ton darf nicht stummgeschaltet werden, sonst käme nur Stille an.
  const video = baueVideoElement(url, !mitTonVersuchen, opt.halter ?? null)
  log.add('Element angelegt', {
    imDokument: document.body.contains(video),
    imHalter: !!opt.halter,
    stumm: video.muted,
  })

  // Jedes Ereignis mitschreiben: Genau hier steht am Ende, ob das Video
  // gepuffert hat, angehalten wurde oder der Dekodierer ausgestiegen ist.
  for (const name of [
    'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'play', 'playing',
    'waiting', 'stalled', 'suspend', 'pause', 'ended', 'emptied', 'abort', 'ratechange',
  ]) {
    video.addEventListener(name, () => {
      log.add(`ev:${name}`, { t: video.currentTime, bereit: video.readyState, netz: video.networkState })
    })
  }
  video.addEventListener('error', () => {
    log.add('ev:error', { code: video.error?.code ?? '?', text: video.error?.message ?? '' })
  })

  melde('Video wird geladen', null)

  let audioCtx: AudioContext | null = null
  let recorder: MediaRecorder | null = null
  let animation = 0
  // Wird gesetzt, sobald die Zeichenschleife läuft – vorher gibt es nichts zu stoppen
  let stoppeSchleife = () => { cancelAnimationFrame(animation) }

  const aufraeumen = () => {
    stoppeSchleife()
    try { if (recorder && recorder.state !== 'inactive') recorder.stop() } catch { /* egal */ }
    try { recorder?.stream.getTracks().forEach(t => t.stop()) } catch { /* egal */ }
    try { audioCtx?.close() } catch { /* egal */ }
    try { video.pause() } catch { /* egal */ }
    video.removeAttribute('src')
    try { video.load() } catch { /* egal */ }
    video.remove()
    URL.revokeObjectURL(url)
  }

  try {
    if (!(await warteAuf(video, 'loadedmetadata', 25_000))) {
      aufraeumen()
      return raus('fehlgeschlagen', 'Video laden')
    }

    const dauer = video.duration
    log.add('Metadaten', {
      dauer,
      breite: video.videoWidth,
      hoehe: video.videoHeight,
      bereit: video.readyState,
    })

    const bitrate = zielBitrate(zielBytes, dauer)
    // Zu lang: Selbst bei gerade noch ansehbarer Qualität passt es nicht.
    // Das ehrlich zu sagen ist besser, als einen Klumpen Pixel abzuliefern.
    if (bitrate === null) {
      aufraeumen()
      return raus('zu_lang', 'Datenrate berechnen')
    }

    // Bei sehr großen Aufnahmen kleiner ansetzen. Ein iPhone dekodiert 4K,
    // skaliert es und kodiert gleichzeitig neu – reicht die Rechenleistung
    // nicht, bleibt die Wiedergabe stehen. 720 statt 1280 nimmt spürbar Last
    // raus und ist für ein Familienalbum immer noch reichlich.
    const langeKante = Math.max(video.videoWidth, video.videoHeight)
    const zielKante = langeKante > 1920 ? 854 : MAX_KANTE
    const faktor = Math.min(1, zielKante / langeKante)
    const canvas = document.createElement('canvas')
    // Gerade Kantenlängen: Ungerade Werte mag kein H.264-Encoder
    canvas.width = Math.round((video.videoWidth * faktor) / 2) * 2
    canvas.height = Math.round((video.videoHeight * faktor) / 2) * 2
    const ctx = canvas.getContext('2d')
    if (!ctx || !canvas.width || !canvas.height) {
      aufraeumen()
      return raus('fehlgeschlagen', 'Leinwand anlegen')
    }

    log.add('Leinwand', { breite: canvas.width, hoehe: canvas.height, bitrate })

    const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream })
      .captureStream(30)
    log.add('Strom', { spuren: stream.getTracks().map(t => t.kind).join('+') || 'keine' })

    // Ton mitnehmen. Der Weg über die Audio-Verarbeitung ist nötig, weil ein
    // Video-Element seine Tonspur nicht direkt herausgibt. Verbunden wird nur
    // mit dem Aufnahme-Ziel, nicht mit den Lautsprechern – sonst würde beim
    // Verkleinern das halbe Video laut abgespielt.
    let mitTon = false
    if (mitTonVersuchen) {
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioCtx = new Ctx()
        if (audioCtx.state === 'suspended') await audioCtx.resume()
        const quelle = audioCtx.createMediaElementSource(video)
        const ziel = audioCtx.createMediaStreamDestination()
        quelle.connect(ziel)
        for (const spur of ziel.stream.getAudioTracks()) stream.addTrack(spur)
        mitTon = ziel.stream.getAudioTracks().length > 0
        log.add('Ton angehängt', { spuren: ziel.stream.getAudioTracks().length, zustand: audioCtx.state })
      } catch (e) {
        mitTon = false
        log.add('Ton fehlgeschlagen', e instanceof Error ? `${e.name}: ${e.message}` : 'unbekannt')
      }
    }

    const teile: Blob[] = []
    recorder = new MediaRecorder(stream, {
      mimeType: format,
      videoBitsPerSecond: bitrate,
      ...(mitTon ? { audioBitsPerSecond: TON_BITRATE } : {}),
    })
    let stuecke = 0
    let bytes = 0
    recorder.ondataavailable = e => {
      if (e.data.size > 0) { teile.push(e.data); stuecke++; bytes += e.data.size }
    }
    recorder.onerror = ev => {
      const f = (ev as Event & { error?: Error }).error
      log.add('rec:error', f ? `${f.name}: ${f.message}` : 'unbekannt')
    }
    recorder.onstart = () => log.add('rec:start')
    recorder.onpause = () => log.add('rec:pause')
    log.add('Aufnahme angelegt', { format, videoBitrate: bitrate, mitTon })
    const aufnahmeBeendet = new Promise<void>(fertig => {
      recorder!.addEventListener('stop', () => fertig(), { once: true })
    })
    recorder.start(1000)
    melde(mitTon ? 'Wiedergabe startet' : 'Wiedergabe startet (ohne Ton)', null)

    // play() kann auf manchen Geräten weder erfüllt noch abgelehnt werden.
    // Deshalb nicht darauf warten, sondern gleich prüfen, ob sich etwas tut.
    video
      .play()
      .then(() => log.add('play() erfüllt', { t: video.currentTime, bereit: video.readyState }))
      .catch(e => log.add('play() abgelehnt', e instanceof Error ? `${e.name}: ${e.message}` : 'unbekannt'))

    // Nur so oft zeichnen, wie es Bilder gibt. Die Bildschirm-Schleife läuft
    // mit 60 Hz, ein Handyvideo hat 30 – die Hälfte der Arbeit wäre doppelt
    // gemacht, und genau die fehlt dem Dekodierer dann.
    type MitFrameCallback = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
      cancelVideoFrameCallback?: (handle: number) => void
    }
    const v = video as MitFrameCallback
    const proFrame = typeof v.requestVideoFrameCallback === 'function'

    // Die Anzeige nicht bei jedem Bild anfassen: 60 Zustandswechsel pro
    // Sekunde kosten mehr Rechenzeit als das Zeichnen selbst.
    let letzteMeldung = 0
    let letzterZeichenlauf = 0

    const zeichne = () => {
      const jetzt = performance.now()
      if (!video.paused && !video.ended) {
        // Ohne Bild-Rückruf von Hand auf 30 Bilder je Sekunde begrenzen
        if (proFrame || jetzt - letzterZeichenlauf >= 32) {
          letzterZeichenlauf = jetzt
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        }
        if (dauer > 0 && jetzt - letzteMeldung >= 250) {
          letzteMeldung = jetzt
          melde('Verkleinern', Math.min(1, video.currentTime / dauer))
        }
      }
      animation = proFrame
        ? v.requestVideoFrameCallback!(zeichne)
        : requestAnimationFrame(zeichne)
    }
    stoppeSchleife = () => {
      if (proFrame && typeof v.cancelVideoFrameCallback === 'function') v.cancelVideoFrameCallback(animation)
      else cancelAnimationFrame(animation)
    }
    animation = proFrame ? v.requestVideoFrameCallback!(zeichne) : requestAnimationFrame(zeichne)

    // Läuft es überhaupt an? Ohne diese Prüfung stünde die Anzeige beliebig
    // lange bei 0 %, und genau so hat es sich auf dem iPhone verhalten.
    const laeuft = await new Promise<boolean>(fertig => {
      const start = Date.now()
      const pruefe = () => {
        if (video.currentTime > 0) return fertig(true)
        if (Date.now() - start > ANLAUF_MS) return fertig(false)
        setTimeout(pruefe, 250)
      }
      pruefe()
    })
    if (!laeuft) {
      aufraeumen()
      return raus('keine_wiedergabe', mitTon ? 'Abspielen mit Ton' : 'Abspielen stumm')
    }

    // Bis zum Ende begleiten – und dabei aufpassen, ob es weitergeht. Ein
    // reiner Not-Timeout hätte am Ende ein abgeschnittenes Video geliefert,
    // das die Prüfungen unten sogar bestanden hätte.
    const ausgang = await new Promise<'fertig' | 'stockt'>(fertig => {
      let letzteZeit = video.currentTime
      let letzteBewegung = Date.now()
      let genudged = false

      const beenden = (wert: 'fertig' | 'stockt') => {
        clearInterval(wache)
        video.removeEventListener('ended', amEnde)
        fertig(wert)
      }
      const amEnde = () => beenden('fertig')
      video.addEventListener('ended', amEnde, { once: true })

      let takte = 0
      const wache = setInterval(() => {
        // Alle fünf Sekunden einen Messpunkt: Daran ist hinterher zu sehen, ob
        // die Wiedergabe gleichmäßig lief, langsamer wurde oder stehenblieb.
        if (++takte % 5 === 0) {
          log.add('Takt', {
            t: video.currentTime,
            von: dauer,
            bereit: video.readyState,
            pausiert: video.paused,
            gepuffert: video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0,
            rec: recorder?.state ?? '-',
            stuecke,
            MB: Math.round(bytes / 1024 / 1024),
          })
        }
        if (video.currentTime > letzteZeit + 0.05) {
          letzteZeit = video.currentTime
          letzteBewegung = Date.now()
          genudged = false
          return
        }
        const steht = Date.now() - letzteBewegung
        // Einmal anstupsen: Nach einem Puffer-Aussetzer bleibt die Wiedergabe
        // manchmal pausiert stehen und läuft mit einem play() wieder an.
        if (steht > STOCKT_MS / 2 && !genudged) {
          genudged = true
          log.add('Anstupsen', { t: video.currentTime, stehtMs: steht, pausiert: video.paused })
          video.play().catch(() => { /* der Abbruch unten greift */ })
          return
        }
        if (steht > STOCKT_MS) {
          log.add('STILLSTAND', { t: video.currentTime, stehtMs: steht, bereit: video.readyState })
          beenden('stockt')
        }
      }, 1000)
    })

    stoppeSchleife()

    if (ausgang === 'stockt') {
      const geschafft = Math.round((video.currentTime / dauer) * 100)
      aufraeumen()
      return raus('wiedergabe_stockt', `Wiedergabe blieb bei ${geschafft} % stehen`)
    }

    if (recorder.state !== 'inactive') recorder.stop()
    await aufnahmeBeendet

    const blob = new Blob(teile, { type: format.split(';')[0] })
    aufraeumen()

    if (blob.size === 0) return raus('fehlgeschlagen', 'Aufnahme auswerten')
    // Nichts gewonnen? Dann lieber das Original behalten – das hat wenigstens
    // die volle Qualität.
    if (blob.size >= file.size) return raus('kein_gewinn', 'Ergebnis prüfen')

    const endung = format.startsWith('video/mp4') ? 'mp4' : 'webm'
    const basis = file.name.replace(/\.[^.]+$/, '') || 'video'
    melde('Fertig', 1)
    log.add('FERTIG', {
      vorher: Math.round(file.size / 1024 / 1024) + 'MB',
      nachher: Math.round(blob.size / 1024 / 1024) + 'MB',
      stuecke,
      mitTon,
    })
    return {
      ok: true,
      file: new File([blob], `${basis}.${endung}`, { type: blob.type }),
      mitTon,
      protokoll: log.text(),
    }
  } catch (e) {
    log.add('AUSNAHME', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
    aufraeumen()
    return raus('fehlgeschlagen', e instanceof Error ? `Ausnahme: ${e.name}` : 'unerwarteter Fehler')
  }
}

export async function komprimiereVideo(
  file: File,
  zielBytes: number,
  opt: Optionen = {},
): Promise<Komprimierergebnis> {
  // Ein gemeinsames Protokoll über beide Anläufe: Der zweite ist nur zu
  // verstehen, wenn danebensteht, woran der erste gescheitert ist.
  const log = new Protokoll()
  log.umgebung()
  log.add('Datei', {
    name: file.name,
    MB: Math.round(file.size / 1024 / 1024),
    typ: file.type || '(leer)',
    zielMB: Math.round(zielBytes / 1024 / 1024),
  })

  if (!kannKomprimieren()) {
    log.add('ABBRUCH', 'Gerät kann nicht verkleinern')
    return { ok: false, grund: 'nicht_unterstuetzt', schritt: 'Fähigkeiten prüfen', protokoll: log.text() }
  }

  const mitTon = await versuch(file, zielBytes, true, opt, log)
  if (mitTon.ok) return mitTon

  // Der Ton ist der empfindlichste Teil: Die Audio-Verarbeitung kann die
  // Wiedergabe blockieren, und stumm abspielen erlaubt jeder Browser ohne
  // Rückfrage. Lieber ein Video ohne Ton als gar keines.
  // Auch beim Stocken lohnt der zweite Anlauf: Ohne Tonverarbeitung hat das
  // Gerät spürbar weniger zu tun.
  if (mitTon.grund === 'keine_wiedergabe' || mitTon.grund === 'wiedergabe_stockt') {
    return versuch(file, zielBytes, false, opt, log)
  }

  return mitTon
}

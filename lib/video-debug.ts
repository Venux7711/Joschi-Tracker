/**
 * Protokoll für das Video-Verkleinern.
 *
 * Warum es das gibt: Das Verkleinern läuft auf einem iPhone, an das ich beim
 * Bauen nicht herankomme. Dreimal habe ich die Ursache aus der Ferne geraten
 * und dreimal danebengelegen. Statt weiter zu raten schreibt der Vorgang jetzt
 * mit, was tatsächlich passiert – welche Ereignisse das Video-Element meldet,
 * wie weit die Wiedergabe kommt, was die Aufnahme liefert.
 *
 * Das Protokoll bleibt auf dem Gerät und lässt sich in der App kopieren. Es
 * enthält keine Bildinhalte, nur Zeiten, Größen und Zustandsnamen.
 */

export type Eintrag = { ms: number; was: string; daten?: string }

export class Protokoll {
  private eintraege: Eintrag[] = []
  private start = Date.now()
  /** Deckel gegen Endlos-Protokolle bei langen Videos */
  private static MAX = 400

  /**
   * Wer mitlesen will, während es läuft.
   *
   * Der Grund: Hängt der Vorgang, erschien das Protokoll bisher erst nach dem
   * Zeitablauf – bis zu zwei Minuten später. Wer vorher aufgibt, sieht es nie.
   * Mit einem Mithörer steht es schon während des Wartens auf dem Bildschirm.
   */
  constructor(private onNeu?: (text: string) => void) {}

  add(was: string, daten?: Record<string, unknown> | string) {
    if (this.eintraege.length >= Protokoll.MAX) return
    this.eintraege.push({
      ms: Date.now() - this.start,
      was,
      daten:
        daten === undefined
          ? undefined
          : typeof daten === 'string'
            ? daten
            : Object.entries(daten)
                .map(([k, v]) => `${k}=${formatWert(v)}`)
                .join(' '),
    })
    this.onNeu?.(this.text())
  }

  /** Umgebung einmal festhalten – Gerät und Browser erklären das meiste */
  umgebung() {
    if (typeof navigator === 'undefined') return
    const n = navigator as Navigator & { deviceMemory?: number }
    this.add('Umgebung', {
      browser: navigator.userAgent,
      kerne: n.hardwareConcurrency ?? '?',
      speicherGB: n.deviceMemory ?? '?',
      bildschirm: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}@${devicePixelRatio}` : '?',
      standalone:
        typeof window !== 'undefined' &&
        !!(window.navigator as Navigator & { standalone?: boolean }).standalone,
    })
  }

  text(): string {
    return this.eintraege
      .map(e => `${String(e.ms).padStart(6, ' ')}ms  ${e.was}${e.daten ? `  ${e.daten}` : ''}`)
      .join('\n')
  }

  get laenge() {
    return this.eintraege.length
  }
}

function formatWert(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  if (v === null || v === undefined) return '-'
  return String(v)
}

/** Wo das letzte Protokoll liegt, damit es auch später noch auffindbar ist. */
export const PROTOKOLL_SCHLUESSEL = 'joschi.video-protokoll'

export function merkeProtokoll(text: string) {
  try {
    localStorage.setItem(PROTOKOLL_SCHLUESSEL, text)
  } catch {
    // Privater Modus oder voller Speicher – das Protokoll ist trotzdem in der
    // Oberfläche zu sehen, nur nach einem Neuladen nicht mehr
  }
}

export function letztesProtokoll(): string | null {
  try {
    return localStorage.getItem(PROTOKOLL_SCHLUESSEL)
  } catch {
    return null
  }
}

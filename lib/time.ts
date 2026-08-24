/**
 * Alle Datums-Rechnungen der App laufen in Berliner Zeit – unabhängig davon, wo
 * der Server steht (Vercel läuft in UTC) oder in welcher Zeitzone das Handy
 * gerade ist. Ohne das landet die Fütterung um 00:30 Uhr nachts auf dem Vortag
 * und "heute" beginnt für den Server schon um 01:00/02:00 Uhr Berliner Zeit.
 *
 * Zeitpunkte in der DB sind timestamptz, also echte Zeitpunkte ohne Zone – nur
 * die Umrechnung "Zeitpunkt ↔ Kalendertag" braucht eine Zone, und die ist hier
 * immer Europe/Berlin (Sommer-/Winterzeit inklusive).
 */

export const APP_TIME_ZONE = 'Europe/Berlin'

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

type BerlinParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value)
}

function berlinParts(date: Date): BerlinParts {
  const map: Record<string, string> = {}
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

/** Abstand Berlin ↔ UTC in Millisekunden zum gegebenen Zeitpunkt (MEZ oder MESZ) */
function berlinOffsetMs(date: Date): number {
  const p = berlinParts(date)
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wallAsUtc - (date.getTime() - date.getMilliseconds())
}

/**
 * Macht aus einer Berliner Wanduhr-Zeit den echten Zeitpunkt. Zwei Durchläufe,
 * weil der Offset selbst vom gesuchten Zeitpunkt abhängt – am Umstellungs-
 * Wochenende liegt der erste Versuch sonst eine Stunde daneben.
 */
export function fromBerlinWallClock(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, ms)
  const firstGuess = new Date(wallAsUtc - berlinOffsetMs(new Date(wallAsUtc)))
  return new Date(wallAsUtc - berlinOffsetMs(firstGuess))
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Berliner Kalendertag als YYYY-MM-DD – der Schlüssel für alle Tages-Gruppierungen */
export function berlinDateKey(date: Date | string | number = new Date()): string {
  const p = berlinParts(toDate(date))
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** Stunde (0–23) auf der Berliner Uhr – für "Guten Morgen/Tag/Abend" & Co. */
export function berlinHour(date: Date | string | number = new Date()): number {
  return berlinParts(toDate(date)).hour
}

/** Berliner Kalenderjahr des Zeitpunkts */
export function berlinYear(date: Date | string | number = new Date()): number {
  return berlinParts(toDate(date)).year
}

/** 00:00:00.000 Berliner Zeit des Tages, in dem der Zeitpunkt liegt */
export function berlinDayStart(date: Date | string | number = new Date()): Date {
  const p = berlinParts(toDate(date))
  return fromBerlinWallClock(p.year, p.month, p.day)
}

/** 23:59:59.999 Berliner Zeit des Tages, in dem der Zeitpunkt liegt */
export function berlinDayEnd(date: Date | string | number = new Date()): Date {
  const p = berlinParts(toDate(date))
  return fromBerlinWallClock(p.year, p.month, p.day, 23, 59, 59, 999)
}

/** Tagesanfang n Berliner Kalendertage später (negatives n = früher) */
export function addBerlinDays(date: Date | string | number, n: number): Date {
  const p = berlinParts(toDate(date))
  // Über Date.UTC normalisieren, damit Monats- und Jahreswechsel stimmen
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + n))
  return fromBerlinWallClock(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

export function isSameBerlinDay(a: Date | string | number, b: Date | string | number): boolean {
  return berlinDateKey(a) === berlinDateKey(b)
}

/** Die letzten n Berliner Kalendertage als Tagesanfänge, ältester zuerst */
export function pastBerlinDays(n: number, from: Date = new Date()): Date[] {
  return Array.from({ length: n }, (_, i) => addBerlinDays(from, -(n - 1 - i)))
}

/** Anzahl ganzer Berliner Kalendertage zwischen zwei Zeitpunkten */
export function berlinDaysBetween(from: Date | string | number, to: Date | string | number): number {
  const a = berlinDayStart(from).getTime()
  const b = berlinDayStart(to).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Wert für <input type="datetime-local"> – zeigt Berliner Wanduhr-Zeit */
export function toBerlinInputValue(date: Date | string | number = new Date()): string {
  const p = berlinParts(toDate(date))
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/**
 * Ist das ein Datum der Form 2026-08-24?
 *
 * Klingt nach einer Kleinigkeit, ist aber die Wache vor fromBerlinInputValue:
 * Kommt dort etwas anderes an, entsteht ein ungültiges Datum, das sich still
 * durch die ganze Seite zieht. Deshalb steht die Prüfung hier zentral und
 * unter Test – eine kaputte Kopie dieser Zeile hat den Betreuungszeitraum
 * schon einmal unbemerkt außer Kraft gesetzt.
 */
export function isIsoDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Umkehrung dazu: "2026-08-08T14:30" wird als Berliner Zeit gelesen */
export function fromBerlinInputValue(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value)
  if (!m) return new Date(value)
  return fromBerlinWallClock(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0))
}

/** Deutsche Formatierung, immer in Berliner Zeit */
export function formatBerlin(date: Date | string | number, options: Intl.DateTimeFormatOptions): string {
  return toDate(date).toLocaleString('de-DE', { timeZone: APP_TIME_ZONE, ...options })
}

/** Wie toLocaleDateString('de-DE') ohne Optionen: 8.8.2026 */
export function formatBerlinDate(date: Date | string | number): string {
  return formatBerlin(date, { day: 'numeric', month: 'numeric', year: 'numeric' })
}

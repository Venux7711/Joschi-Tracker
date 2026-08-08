import type { StoolConsistency, Appetite, Activity } from './types'
import {
  berlinDateKey,
  berlinDayStart,
  berlinDayEnd,
  formatBerlin,
  isSameBerlinDay,
  toBerlinInputValue,
} from './time'

// Eine gemeinsame Mahlzeit erzeugt eine Zeile pro Katze (gleiche Sorte, gleicher
// Zeitpunkt). Für Anzeigen/Statistiken auf Haushaltsebene zählt sie nur einmal.
export function dedupeSharedFeedings<T extends { food_brand: string; food_type: string; logged_at: string }>(logs: T[]): T[] {
  const seen = new Set<string>()
  return logs.filter((f) => {
    const key = `${f.food_brand}||${f.food_type}||${f.logged_at}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Für "wie oft gab es diese Sorte?"-Statistiken zählt eine Futtersorte pro Tag
// nur einmal – dreimal Truthahn an einem Tag ist ein Truthahn-Tag, nicht drei.
// Deckt gemeinsame Mahlzeiten (eine Zeile pro Katze) gleich mit ab.
export function dedupeFeedingsPerDay<T extends { food_brand: string; food_type: string; logged_at: string }>(logs: T[]): T[] {
  const seen = new Set<string>()
  return logs.filter((f) => {
    const key = `${f.food_brand}||${f.food_type}||${berlinDateKey(f.logged_at)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function formatDate(dateStr: string): string {
  return formatBerlin(dateStr, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatTime(dateStr: string): string {
  return formatBerlin(dateStr, { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)}, ${formatTime(dateStr)}`
}

/** Wert für <input type="datetime-local"> – Berliner Wanduhr-Zeit */
export function toLocalISOString(date: Date = new Date()): string {
  return toBerlinInputValue(date)
}

export function getDayStart(date: Date = new Date()): string {
  return berlinDayStart(date).toISOString()
}

export function getDayEnd(date: Date = new Date()): string {
  return berlinDayEnd(date).toISOString()
}

export function isToday(dateStr: string): boolean {
  return isSameBerlinDay(dateStr, new Date())
}

export function isSameDay(a: Date, b: Date): boolean {
  return isSameBerlinDay(a, b)
}

export function getStoolLabel(value: StoolConsistency): string {
  const map: Record<StoolConsistency, string> = {
    normal: 'Normal',
    soft: 'Weich',
    diarrhea: 'Durchfall',
    not_observed: 'Nicht gesehen',
  }
  return map[value]
}

export function getAppetiteLabel(value: Appetite): string {
  const map: Record<Appetite, string> = {
    good: 'Gut',
    reduced: 'Wenig',
    none: 'Gar nicht',
  }
  return map[value]
}

export function getActivityLabel(value: Activity): string {
  const map: Record<Activity, string> = {
    normal: 'Normal',
    tired: 'Müde',
    very_active: 'Sehr aktiv',
  }
  return map[value]
}

export function getStoolColor(value: StoolConsistency): string {
  const map: Record<StoolConsistency, string> = {
    normal: 'bg-green-100 text-green-800',
    soft: 'bg-yellow-100 text-yellow-800',
    diarrhea: 'bg-red-100 text-red-800',
    not_observed: 'bg-gray-100 text-gray-600',
  }
  return map[value]
}

export function getStoolDot(value: StoolConsistency): string {
  const map: Record<StoolConsistency, string> = {
    normal: 'bg-green-400',
    soft: 'bg-yellow-400',
    diarrhea: 'bg-red-500',
    not_observed: 'bg-gray-300',
  }
  return map[value]
}

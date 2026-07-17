import type { StoolConsistency, Appetite, Activity } from './types'

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

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)}, ${formatTime(dateStr)}`
}

export function toLocalISOString(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

export function getDayStart(date: Date = new Date()): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function getDayEnd(date: Date = new Date()): string {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

export function isToday(dateStr: string): boolean {
  const date = new Date(dateStr)
  const today = new Date()
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  )
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  )
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

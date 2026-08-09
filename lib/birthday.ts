import { berlinDateKey, addBerlinDays } from './time'

export type BirthdayInfo = {
  /** Heute ist der Geburtstag */
  isToday: boolean
  /** Gestern war der Geburtstag – am Tag danach zeigt das Dashboard den Rückblick */
  wasYesterday: boolean
  /** Alter, das an diesem Geburtstag erreicht wird bzw. wurde */
  age: number
  /** Aktuelles Alter in vollen Jahren */
  currentAge: number
  /** Tage bis zum nächsten Geburtstag (0 = heute) */
  daysUntil: number
}

/** "YYYY-MM-DD" → [Jahr, Monat, Tag] */
function parts(isoDate: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/**
 * Alles rund um den Geburtstag, gerechnet auf Berliner Kalendertagen – ein
 * Geburtstag ist ein Datum, kein Zeitpunkt, und darf nicht an der Zeitzone des
 * Servers hängen.
 *
 * Der 29. Februar wird in Nicht-Schaltjahren am 1. März gefeiert.
 */
export function birthdayInfo(birthday: string | null, now: Date = new Date()): BirthdayInfo | null {
  const p = parts(birthday ?? '')
  if (!p) return null
  const [birthYear, birthMonth, birthDay] = p

  const todayKey = berlinDateKey(now)
  const [todayYear, todayMonth, todayDay] = parts(todayKey)!

  /** Auf welchen Kalendertag fällt der Geburtstag in diesem Jahr? */
  const occurrence = (year: number): string => {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    if (birthMonth === 2 && birthDay === 29 && !isLeap) return `${year}-03-01`
    return `${year}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`
  }

  const thisYear = occurrence(todayYear)
  const isToday = thisYear === todayKey

  // Gestern kann im Vorjahr liegen (Geburtstag am 31.12., heute der 1.1.) –
  // deshalb gegen den Geburtstag im Jahr von *gestern* prüfen, nicht gegen den
  // diesjährigen.
  const yesterdayKey = berlinDateKey(addBerlinDays(now, -1))
  const yesterdayYear = Number(yesterdayKey.slice(0, 4))
  const wasYesterday = occurrence(yesterdayYear) === yesterdayKey

  // Volles Alter: Jahre seit Geburt, abzüglich eines Jahres wenn der
  // diesjährige Geburtstag noch bevorsteht
  const beforeBirthday =
    todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)
  const currentAge = todayYear - birthYear - (beforeBirthday ? 1 : 0)

  // Tage bis zum nächsten Geburtstag
  const nextKey = beforeBirthday || isToday ? thisYear : occurrence(todayYear + 1)
  let daysUntil = 0
  if (!isToday) {
    // Höchstens ein Jahr vorwärts zählen – reicht immer und bleibt exakt
    for (let i = 1; i <= 366; i++) {
      if (berlinDateKey(addBerlinDays(now, i)) === nextKey) { daysUntil = i; break }
    }
  }

  return {
    isToday,
    wasYesterday,
    age: wasYesterday ? currentAge : isToday ? currentAge : currentAge + 1,
    currentAge,
    daysUntil,
  }
}

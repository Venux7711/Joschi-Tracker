/**
 * Das Gedächtnis der App – Begriffe und Formen.
 *
 * Die Schichten, die überall in diesem Ordner auftauchen:
 *
 *   ROHDATEN     Fütterungen, Fotos, Befinden – was in der Datenbank steht.
 *   BEOBACHTUNG  Was daran an einem einzelnen Tag zu sehen war.
 *   ERINNERUNG   Was über den Tag hinaus gilt, weil es sich wiederholt hat.
 *   AUSDRUCK     Der Satz, den jemand liest.
 *
 * Die Trennung ist kein Selbstzweck. Ohne sie springt ein Sprachmodell direkt
 * von Rohdaten zur Pointe, und dann behauptet es Dinge, die niemand belegen
 * kann. Jede Erinnerung hier trägt ihren Beleg mit sich.
 */

export type MemoryTyp =
  | 'fact'
  | 'observation'
  | 'event'
  | 'milestone'
  | 'preference'
  | 'pattern'
  | 'running_gag'
  | 'relationship'
  | 'temporal_pattern'

export type MemoryStatus = 'tentative' | 'active' | 'stale' | 'superseded'
export type MemoryQuelle = 'beobachtung' | 'nutzer'
export type SubjektTyp = 'cat' | 'pair' | 'household'

export type Beleg = {
  /** Fotos, auf denen es zu sehen war. Höchstens die letzten paar. */
  fotoIds: string[]
  /** Tage, an denen es vorkam – Datumsschlüssel, jüngste zuerst. */
  tage: string[]
}

export type Memory = {
  id?: string
  subjectType: SubjektTyp
  subjectId: string | null
  memoryType: MemoryTyp
  /** Normalisiert: klein, getrimmt. Ist zugleich der Wiedererkennungsschlüssel. */
  title: string
  description: string | null
  evidence: Beleg
  sourcePhotoIds: string[]
  confidence: number
  occurrenceCount: number
  firstSeenAt: string
  lastSeenAt: string
  status: MemoryStatus
  source: MemoryQuelle
}

/**
 * Was an einem Tag beobachtet wurde – noch keine Erinnerung.
 *
 * Der Unterschied ist wichtig: "Bella lag auf dem Fensterbrett" ist eine
 * Beobachtung. Erst wenn das mehrfach vorkommt, wird daraus "Bella nutzt
 * häufig das Fensterbrett". Eine einzelne Beobachtung darf nie zur Präferenz
 * erklärt werden.
 */
export type Beobachtung = {
  subjectType: SubjektTyp
  /** Name der Katze, falls zuzuordnen – wird später auf die id abgebildet. */
  katze: string | null
  /** Woraus die Erinnerung wachsen könnte. */
  art: 'platz' | 'objekt' | 'aktivitaet' | 'zusammen' | 'ort' | 'futter'
  /** Der Kern, klein geschrieben: "sofa", "roter karton", "fensterbrett". */
  wert: string
  fotoId: string | null
  tag: string
}

/** Was aus Beobachtungen als Erinnerung entstehen könnte. */
export type Kandidat = {
  subjectType: SubjektTyp
  subjectId: string | null
  memoryType: MemoryTyp
  title: string
  description: string | null
  fotoIds: string[]
  tag: string
}

/** Was die Verschmelzung mit einer Erinnerung gemacht hat. */
export type Aenderung =
  | { art: 'neu'; memory: Memory }
  | { art: 'verstaerkt'; memory: Memory; vorher: Memory }
  | { art: 'unveraendert'; memory: Memory }

/** Vereinheitlicht Titel, damit "Der Karton" und "der  karton" dasselbe sind. */
export function normalisiere(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120)
}

/**
 * Der Schlüssel, unter dem eine Erinnerung wiedererkannt wird.
 *
 * Bewusst ohne die Art: Die verändert sich im Laufe der Zeit. Aus einer
 * Beobachtung wird ein Muster, daraus eine Vorliebe – es bleibt dieselbe
 * Erinnerung an denselben Sachverhalt. Wäre die Art Teil des Schlüssels, gäbe
 * es nach jeder Beförderung eine zweite Zeile mit demselben Inhalt, und der
 * Zähler finge wieder bei eins an.
 *
 * Identität ist also: über wen, worüber. Nicht: in welchem Reifegrad.
 */
export function schluessel(k: {
  subjectType: SubjektTyp
  subjectId: string | null
  title: string
}): string {
  return [k.subjectType, k.subjectId ?? '-', normalisiere(k.title)].join('|')
}

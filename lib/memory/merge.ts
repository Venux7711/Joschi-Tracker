/**
 * Neue Beobachtungen in das Gedächtnis einarbeiten.
 *
 * Der Kern des Ganzen und bewusst ohne Datenbank: reine Funktionen, damit sich
 * die Regeln prüfen lassen, ohne einen Tag zu simulieren.
 *
 * Die Leitfrage bei jeder Regel war: Was passiert, wenn das System sich irrt?
 * Deshalb entsteht nichts sofort als Gewissheit. Etwas einmal Gesehenes ist
 * "tentative" und taucht in keinem Satz auf. Erst Wiederholung macht daraus
 * Wissen. Und nichts wird endgültig: Was lange nicht mehr vorkam, verblasst.
 */

import {
  normalisiere, schluessel,
  type Aenderung, type Beleg, type Kandidat, type Memory, type MemoryTyp,
} from './types'

/**
 * Ab wie vielen Vorkommnissen eine Erinnerung als gesichert gilt.
 *
 * Drei, nicht zwei: Zweimal kann Zufall sein. Wer an zwei Tagen zufällig auf
 * demselben Sessel fotografiert wurde, hat noch keinen Lieblingsplatz.
 */
export const SICHER_AB = 3

/**
 * Ab wann ein wiederkehrendes Objekt zum Running Gag wird.
 *
 * Höher als SICHER_AB, weil ein Gag von der Vertrautheit lebt. Beim vierten
 * Mal weiß auch der Mensch, dass dieser Karton ein Thema ist – vorher wäre die
 * Anspielung ins Leere gelaufen.
 */
export const GAG_AB = 4

/** Ab wann aus einem Muster eine Vorliebe wird. */
export const VORLIEBE_AB = 8

/**
 * Wie lange eine Erinnerung ohne neue Bestätigung gilt, je Art.
 *
 * Ein Ereignis ("erstmals zusammen geschlafen") veraltet nie – es ist passiert.
 * Ein Muster dagegen ist eine Aussage über die Gegenwart und muss sich immer
 * wieder bestätigen, sonst behauptet die App etwas über eine Katze, das seit
 * einem halben Jahr nicht mehr stimmt.
 */
export const HALTBARKEIT_TAGE: Record<MemoryTyp, number | null> = {
  fact: 30,
  observation: 21,
  event: null,
  milestone: null,
  preference: 180,
  pattern: 120,
  running_gag: 150,
  relationship: 120,
  temporal_pattern: 400,
}

const tagAbstand = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/**
 * Wie stark eine Bestätigung die Zuversicht hebt.
 *
 * Mit abnehmendem Ertrag: Die ersten Wiederholungen sagen viel, die
 * zwanzigste kaum noch etwas. Ohne diese Dämpfung stünde nach zwei Monaten
 * alles bei 100 Prozent und die Gewichtung wäre wertlos.
 */
function naechsteZuversicht(bisher: number, anzahl: number): number {
  const zuwachs = 0.25 / Math.sqrt(anzahl + 1)
  return Math.min(0.97, Math.round((bisher + zuwachs) * 1000) / 1000)
}

/** Aus wie oft gesehen und welcher Art ergibt sich, was es inzwischen ist. */
function befoerdere(typ: MemoryTyp, anzahl: number): MemoryTyp {
  if (typ === 'observation' && anzahl >= SICHER_AB) return 'pattern'
  if (typ === 'pattern' && anzahl >= VORLIEBE_AB) return 'preference'
  return typ
}

function belegeErweitern(alt: Beleg, fotoIds: string[], tag: string): Beleg {
  return {
    // Nur die letzten zwölf Fotos behalten. Wer eine Erinnerung belegen will,
    // braucht Beispiele, keine vollständige Akte.
    fotoIds: Array.from(new Set([...fotoIds, ...alt.fotoIds])).slice(0, 12),
    tage: Array.from(new Set([tag, ...alt.tage])).sort().reverse().slice(0, 40),
  }
}

/**
 * Arbeitet die Kandidaten eines Tages in den vorhandenen Bestand ein.
 *
 * Gibt zurück, was sich geändert hat – nicht den neuen Bestand. So kann die
 * aufrufende Stelle genau die Zeilen schreiben, die sich wirklich geändert
 * haben, statt alles neu zu speichern.
 */
export function verschmelze(
  bestand: Memory[],
  kandidaten: Kandidat[],
  tag: string,
): Aenderung[] {
  const nachSchluessel = new Map(bestand.map(m => [schluessel(m), m]))
  const aenderungen: Aenderung[] = []

  // Mehrfachnennungen desselben Themas an einem Tag zusammenfassen: Wer auf
  // drei Fotos desselben Tages auf dem Sofa liegt, war einmal auf dem Sofa.
  const proSchluessel = new Map<string, Kandidat>()
  for (const k of kandidaten) {
    const s = schluessel(k)
    const vorhanden = proSchluessel.get(s)
    if (vorhanden) {
      vorhanden.fotoIds = Array.from(new Set([...vorhanden.fotoIds, ...k.fotoIds]))
    } else {
      proSchluessel.set(s, { ...k, title: normalisiere(k.title), fotoIds: [...k.fotoIds] })
    }
  }

  for (const [s, k] of proSchluessel) {
    const alt = nachSchluessel.get(s)

    if (!alt) {
      aenderungen.push({
        art: 'neu',
        memory: {
          subjectType: k.subjectType,
          subjectId: k.subjectId,
          memoryType: k.memoryType,
          title: normalisiere(k.title),
          description: k.description,
          evidence: { fotoIds: k.fotoIds.slice(0, 12), tage: [tag] },
          sourcePhotoIds: k.fotoIds.slice(0, 12),
          confidence: 0.25,
          occurrenceCount: 1,
          firstSeenAt: tag,
          lastSeenAt: tag,
          // Einmal gesehen ist noch nichts. Erst ab SICHER_AB taucht eine
          // Erinnerung in einem Satz auf.
          status: 'tentative',
          source: 'beobachtung',
        },
      })
      continue
    }

    // Derselbe Tag noch einmal verarbeitet – etwa nach einem Neuwürfeln.
    // Dann darf der Zähler nicht ein zweites Mal steigen.
    if (alt.evidence.tage.includes(tag)) {
      aenderungen.push({ art: 'unveraendert', memory: alt })
      continue
    }

    const anzahl = alt.occurrenceCount + 1
    const typ = alt.source === 'nutzer' ? alt.memoryType : befoerdere(alt.memoryType, anzahl)

    aenderungen.push({
      art: 'verstaerkt',
      vorher: alt,
      memory: {
        ...alt,
        memoryType: typ,
        occurrenceCount: anzahl,
        // Eine Nutzerkorrektur behält ihre volle Zuversicht. Sie darf von
        // Beobachtungen bestätigt, aber nicht relativiert werden.
        confidence: alt.source === 'nutzer' ? alt.confidence : naechsteZuversicht(alt.confidence, anzahl),
        lastSeenAt: tag,
        evidence: belegeErweitern(alt.evidence, k.fotoIds, tag),
        sourcePhotoIds: Array.from(new Set([...k.fotoIds, ...alt.sourcePhotoIds])).slice(0, 12),
        status: alt.status === 'superseded'
          ? 'superseded'
          : anzahl >= SICHER_AB ? 'active' : 'tentative',
      },
    })
  }

  return aenderungen
}

/**
 * Erinnerungen, die zu lange nichts von sich hören ließen, verblassen lassen.
 *
 * Kein Löschen: Was einmal galt, bleibt nachlesbar. Es fließt nur nicht mehr
 * in neue Sätze ein. Eine verblasste Erinnerung, die wieder auftaucht, wird
 * durch verschmelze() automatisch wieder aktiv – genau das macht einen Running
 * Gag nach langer Pause wieder komisch.
 */
export function veralte(bestand: Memory[], heute: string): Memory[] {
  return bestand.map(m => {
    if (m.status !== 'active' && m.status !== 'tentative') return m
    // Eine Nutzerkorrektur veraltet nicht von selbst. Wer etwas ausdrücklich
    // festgestellt hat, soll das nicht vom Zeitablauf widerrufen bekommen.
    if (m.source === 'nutzer') return m

    const frist = HALTBARKEIT_TAGE[m.memoryType]
    if (frist === null) return m
    if (tagAbstand(m.lastSeenAt, heute) <= frist) return m

    return { ...m, status: 'stale' as const }
  })
}

/**
 * Eine Erinnerung, der die Daten widersprechen, in der Zuversicht senken.
 *
 * Beispiel: "Bella bevorzugt das Fensterbrett", aber seit Monaten liegt sie
 * woanders. Nicht löschen – die Aussage war einmal richtig. Sinkt die
 * Zuversicht unter die Schwelle, gilt sie als verblasst.
 */
export function widersprich(m: Memory, staerke = 0.15): Memory {
  if (m.source === 'nutzer') return m
  const neu = Math.max(0, Math.round((m.confidence - staerke) * 1000) / 1000)
  return { ...m, confidence: neu, status: neu < 0.2 ? 'stale' : m.status }
}

/**
 * Eine Erinnerung durch eine Nutzeraussage ersetzen.
 *
 * Der Mensch hat immer recht: volle Zuversicht, Quelle 'nutzer', und von da an
 * kann keine Beobachtung sie mehr abwerten. Alles andere wäre respektlos
 * gegenüber jemandem, der seine Katzen jeden Tag sieht.
 */
export function korrigiere(m: Memory, titel: string, beschreibung: string | null, tag: string): Memory {
  return {
    ...m,
    title: normalisiere(titel),
    description: beschreibung,
    confidence: 1,
    status: 'active',
    source: 'nutzer',
    lastSeenAt: tag,
  }
}

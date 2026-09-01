/**
 * Von Beobachtungen zu Erinnerungs-Kandidaten.
 *
 * Die Beobachtungen selbst kommen aus zwei Quellen: aus den Daten (Fütterungen,
 * Orte, wer auf einem Foto markiert ist) und aus der Bildanalyse, die ohnehin
 * für die Katzengedanken läuft. Ein Modellaufruf, zwei Verwendungen – die
 * Analyse ein zweites Mal zu bezahlen wäre Unsinn.
 *
 * Hier wird nichts erfunden und nichts bewertet. Diese Datei übersetzt nur:
 * "Bella lag auf dem Fensterbrett" wird zu einem Kandidaten für eine
 * Erinnerung. Ob daraus je eine wird, entscheidet die Verschmelzung – und die
 * verlangt Wiederholung.
 */

import type { Beobachtung, Kandidat, MemoryTyp } from './types'
import { normalisiere } from './types'

/**
 * Wörter, die als Beobachtung nichts taugen.
 *
 * Ein Modell, das nach Objekten gefragt wird, antwortet gern mit "Boden",
 * "Wand" oder "Fell". Daraus einen Running Gag wachsen zu lassen wäre absurd –
 * das ist in jedem Katzenfoto zu sehen.
 */
const ZU_ALLGEMEIN = new Set([
  'boden', 'wand', 'decke', 'raum', 'zimmer', 'licht', 'schatten', 'fell',
  'katze', 'kater', 'tier', 'hintergrund', 'vordergrund', 'luft', 'himmel',
  'nichts', 'unklar', 'objekt', 'gegenstand', 'ding', 'sache', 'mensch',
])

/** Taugt dieser Wert überhaupt als Beobachtung? */
export function brauchbar(wert: string): boolean {
  const w = normalisiere(wert)
  if (w.length < 3 || w.length > 60) return false
  if (ZU_ALLGEMEIN.has(w)) return false
  // Ganze Sätze sind keine Beobachtung, sondern schon eine Interpretation
  if (w.split(' ').length > 4) return false
  return true
}

/** Welche Art Erinnerung könnte aus dieser Beobachtung wachsen? */
function startTyp(art: Beobachtung['art']): MemoryTyp {
  switch (art) {
    // Plätze und Orte werden bei Wiederholung zu Mustern und später zu
    // Vorlieben – das erledigt die Beförderung in der Verschmelzung.
    case 'platz': return 'observation'
    case 'ort': return 'observation'
    case 'aktivitaet': return 'observation'
    // Objekte sind der Stoff, aus dem Running Gags werden. Sie starten
    // trotzdem als Beobachtung; zum Gag werden sie erst durch Wiederkehr.
    case 'objekt': return 'observation'
    case 'zusammen': return 'relationship'
    case 'futter': return 'fact'
  }
}

/** Ein lesbarer Satz zur Erinnerung – das ist es, was später im Prompt steht. */
function beschreibe(b: Beobachtung, katzenName: string | null): string {
  const wer = b.subjectType === 'pair' ? 'Beide' : katzenName ?? 'Die Katze'
  switch (b.art) {
    case 'platz': return `${wer} auf dem Platz „${b.wert}"`
    case 'ort': return `${wer} am Ort „${b.wert}"`
    case 'objekt': return `„${b.wert}" taucht auf Fotos auf`
    case 'aktivitaet': return `${wer}: ${b.wert}`
    case 'zusammen': return 'Beide auf einem Foto'
    case 'futter': return `Futter: ${b.wert}`
  }
}

/**
 * Macht aus den Beobachtungen eines Tages Kandidaten.
 *
 * Bewusst ohne Datenbank und ohne Historie: Was hier herauskommt, ist noch
 * kein Wissen, sondern nur "das könnte etwas werden".
 */
export function zuKandidaten(
  beobachtungen: Beobachtung[],
  katzenIds: Record<string, string>,
  tag: string,
): Kandidat[] {
  const kandidaten: Kandidat[] = []

  for (const b of beobachtungen) {
    if (!brauchbar(b.wert)) continue

    const katzenName = b.katze
    const subjectId = b.subjectType === 'cat' && katzenName
      ? katzenIds[katzenName.toLowerCase()] ?? null
      : null

    // Eine Katzen-Beobachtung ohne zuzuordnende Katze ist wertlos: Sie ließe
    // sich später keiner Stimme zuordnen. Lieber verwerfen.
    if (b.subjectType === 'cat' && !subjectId) continue

    kandidaten.push({
      subjectType: b.subjectType,
      subjectId,
      memoryType: startTyp(b.art),
      title: normalisiere(b.art === 'zusammen' ? 'gemeinsam auf einem foto' : b.wert),
      description: beschreibe(b, katzenName),
      fotoIds: b.fotoId ? [b.fotoId] : [],
      tag,
    })
  }

  return kandidaten
}

/**
 * Liest die strukturierten Beobachtungen aus der Modellantwort.
 *
 * Die Bildanalyse für die Katzengedanken liefert zusätzlich, was auf jedem
 * Foto zu sehen war. Alles wird streng geprüft: Was das Modell unsicher oder
 * unbrauchbar zurückgibt, fällt hier weg statt später als Tatsache im
 * Gedächtnis zu landen.
 */
export function leseBeobachtungen(roh: unknown, fotoIds: string[], tag: string): Beobachtung[] {
  if (!Array.isArray(roh)) return []
  const raus: Beobachtung[] = []

  for (const eintrag of roh.slice(0, 6)) {
    if (!eintrag || typeof eintrag !== 'object') continue
    const e = eintrag as Record<string, unknown>

    const nummer = typeof e.bild === 'number' ? e.bild : Number(e.bild)
    const fotoId = Number.isInteger(nummer) && nummer > 0 ? fotoIds[nummer - 1] ?? null : null

    const katze = typeof e.katze === 'string' && e.katze.trim() ? e.katze.trim() : null
    const beide = katze !== null && /beide/i.test(katze)
    const subjectType = beide ? 'pair' as const : katze ? 'cat' as const : 'household' as const

    const nimm = (feld: string, art: Beobachtung['art']) => {
      const wert = e[feld]
      if (typeof wert !== 'string' || !wert.trim()) return
      raus.push({
        subjectType,
        katze: beide ? null : katze,
        art,
        wert: normalisiere(wert),
        fotoId,
        tag,
      })
    }

    nimm('platz', 'platz')
    nimm('aktivitaet', 'aktivitaet')

    if (Array.isArray(e.objekte)) {
      for (const o of e.objekte.slice(0, 3)) {
        if (typeof o !== 'string' || !o.trim()) continue
        raus.push({
          subjectType: 'household',
          katze: null,
          art: 'objekt',
          wert: normalisiere(o),
          fotoId,
          tag,
        })
      }
    }

    if (beide) {
      raus.push({ subjectType: 'pair', katze: null, art: 'zusammen', wert: 'zusammen', fotoId, tag })
    }
  }

  return raus.filter(b => brauchbar(b.wert))
}

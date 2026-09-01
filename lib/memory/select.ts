/**
 * Welche Erinnerungen kommen heute zum Einsatz?
 *
 * Nicht alle. Das ganze Gedächtnis an ein Modell zu schicken wäre teuer und
 * würde das Ergebnis verschlechtern: Bei dreißig Erinnerungen im Text sucht
 * sich ein Modell die auffälligste heraus, nicht die passende.
 *
 * Also wird ausgewählt – nach dem, was heute tatsächlich passiert ist, nach
 * Verlässlichkeit, und mit einer Sperre gegen Wiederholung. Ein Running Gag,
 * der an drei Tagen hintereinander kommt, ist keiner mehr.
 */

import type { Memory, MemoryTyp } from './types'

/** Wie viele Erinnerungen höchstens in einen Gedanken einfließen. */
export const HOECHSTENS = 6

/**
 * Wie lange ein Running Gag nach Verwendung ruht.
 *
 * Zwölf Tage. Kurz genug, dass das Thema nicht vergessen wird, lang genug,
 * dass das Wiedersehen etwas bedeutet. Das ist der Unterschied zwischen einem
 * Insider und einer Masche.
 */
export const GAG_SPERRE_TAGE = 12

/**
 * Grundgewicht je Art.
 *
 * Ereignisse und Meilensteine stehen oben, weil sie einmalig sind – ein
 * erstes gemeinsames Schlafen erwähnt man, ein Sofa nicht. Reine Fakten stehen
 * unten: dass zweimal gefüttert wurde, steht ohnehin in den Tagesdaten.
 */
const GEWICHT: Record<MemoryTyp, number> = {
  // Ganz oben: Der Mensch sieht seine Katzen jeden Tag, die App sieht Fotos.
  // Was er ausdrücklich gesagt hat, wiegt schwerer als jede Ableitung.
  user_fact: 6,
  milestone: 5,
  event: 4,
  running_gag: 3.5,
  relationship: 3,
  preference: 2.5,
  pattern: 2,
  temporal_pattern: 2,
  observation: 1,
  fact: 0.5,
}

export type Kontext = {
  /** Worum es heute ging – Plätze, Objekte, Orte, kleingeschrieben. */
  themen: string[]
  /** Katzen-Kennungen, die heute vorkamen. */
  katzen: string[]
  /** Waren beide auf einem Bild? */
  zusammen: boolean
  /** Datumsschlüssel von heute. */
  tag: string
  /** Welche Erinnerung wurde wann zuletzt verwendet. */
  zuletztVerwendet: Record<string, string>
}

const tagAbstand = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/**
 * Ruht dieser Running Gag gerade?
 *
 * Gilt nur für Gags. Eine Vorliebe darf jeden Tag im Hintergrund mitschwingen,
 * eine Pointe nicht.
 */
export function gagGesperrt(m: Memory, kontext: Kontext): boolean {
  if (m.memoryType !== 'running_gag') return false
  const zuletzt = m.id ? kontext.zuletztVerwendet[m.id] : undefined
  if (!zuletzt) return false
  return tagAbstand(zuletzt, kontext.tag) < GAG_SPERRE_TAGE
}

/** Wie gut passt diese Erinnerung zum heutigen Tag? */
export function bewerte(m: Memory, kontext: Kontext): number {
  let punkte = GEWICHT[m.memoryType]

  // Verlässlichkeit zählt, aber sie entscheidet nicht allein – sonst käme
  // jeden Tag dieselbe bestbelegte Erinnerung.
  punkte += m.confidence * 2

  // Wiederholung mit abnehmendem Ertrag: der Unterschied zwischen 3 und 6
  // Vorkommnissen ist groß, der zwischen 30 und 60 nicht.
  punkte += Math.log2(m.occurrenceCount + 1) * 0.6

  // Der wichtigste Beitrag: Passt es zu dem, was heute zu sehen war? Eine
  // Erinnerung an den Karton ist an einem Tag mit Karton auf dem Foto viel
  // mehr wert als an einem beliebigen anderen.
  //
  // Der Wert ist absichtlich hoch genug, um alles andere zu überstimmen: Ohne
  // das gewinnt jeden Tag dieselbe bestbelegte Vorliebe, und der Bezug zum
  // heutigen Tag – der einzige Grund, überhaupt auszuwählen – ginge unter.
  const titel = m.title.toLowerCase()
  if (kontext.themen.some(t => titel.includes(t) || t.includes(titel))) punkte += 6

  if (m.subjectType === 'pair' && kontext.zusammen) punkte += 2
  if (m.subjectId && kontext.katzen.includes(m.subjectId)) punkte += 1

  // Was lange nicht mehr dran war, gewinnt etwas – so kommt auch Älteres
  // wieder vor, statt dass sich dieselben drei Themen festsetzen.
  const zuletzt = m.id ? kontext.zuletztVerwendet[m.id] : undefined
  if (zuletzt) {
    const her = tagAbstand(zuletzt, kontext.tag)
    punkte += her > 30 ? 1 : her > 14 ? 0.5 : -1.5
  }

  return Math.round(punkte * 100) / 100
}

/**
 * Die Erinnerungen, die heute in den Gedanken einfließen dürfen.
 *
 * Bewusst streng: Nur Gesichertes. Etwas einmal Gesehenes ("tentative") taucht
 * nie in einem Satz auf – sonst behauptet die App nach einem einzigen Foto,
 * Bella möge das Fensterbrett.
 */
export function waehleRelevante(
  bestand: Memory[],
  kontext: Kontext,
  hoechstens = HOECHSTENS,
): Memory[] {
  return bestand
    // user_confirmed zählt wie active: Es ist bestätigtes Wissen, nur aus
    // einer anderen Quelle.
    .filter(m => m.status === 'active' || m.status === 'user_confirmed')
    .filter(m => !gagGesperrt(m, kontext))
    .map(m => ({ m, punkte: bewerte(m, kontext) }))
    .sort((a, b) => b.punkte - a.punkte)
    .slice(0, hoechstens)
    .map(x => x.m)
}

/**
 * Sagt der neue Satz im Kern dasselbe wie einer der letzten?
 *
 * Kein Sprachverständnis, nur Wortüberschneidung – und genau das reicht für
 * den Fall, um den es geht: "Ich wurde ignoriert" in fünf Varianten
 * hintereinander. Kurze Füllwörter fliegen raus, weil sonst jeder deutsche
 * Satz jedem anderen ähnelt.
 */
export function zuAehnlich(neu: string, letzte: string[], schwelle = 0.55): boolean {
  const woerter = (s: string) =>
    new Set(
      s.toLowerCase()
        .replace(/[^a-zäöüß\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3),
    )

  const a = woerter(neu)
  if (a.size === 0) return false

  for (const alt of letzte) {
    const b = woerter(alt)
    if (b.size === 0) continue
    let gemeinsam = 0
    for (const w of a) if (b.has(w)) gemeinsam++
    // Anteil an der kleineren Menge: Ein kurzer Satz, der ganz in einem
    // längeren aufgeht, ist eine Wiederholung – auch wenn der längere
    // zusätzlich noch anderes sagt.
    if (gemeinsam / Math.min(a.size, b.size) >= schwelle) return true
  }
  return false
}

/**
 * Formuliert die ausgewählten Erinnerungen für das Modell.
 *
 * Mit Zahlen dahinter, und das ist Absicht: "seit Mai, sechs Mal" erlaubt dem
 * Modell Wörter wie "inzwischen" oder "schon wieder" – die tragen das Gefühl
 * von Entwicklung. Ohne die Zahlen bliebe nur ein Stichwort ohne Geschichte.
 */
export function alsText(memories: Memory[], namen: Record<string, string>): string {
  if (memories.length === 0) return 'Noch keine gesicherten Erinnerungen.'

  return memories.map(m => {
    const wer = m.subjectType === 'pair' ? 'Beide'
      : m.subjectType === 'household' ? 'Zuhause'
      : (m.subjectId && namen[m.subjectId]) || 'Katze'
    const wie = m.occurrenceCount > 1 ? `, ${m.occurrenceCount}× beobachtet` : ''
    const seit = m.firstSeenAt !== m.lastSeenAt ? `, seit ${m.firstSeenAt}` : ''
    const art = m.memoryType === 'user_fact' ? ' [vom Haushalt mitgeteilt]'
      : m.memoryType === 'running_gag' ? ' [wiederkehrendes Thema]'
      : m.memoryType === 'milestone' ? ' [Meilenstein]'
      : m.memoryType === 'event' ? ' [Ereignis]'
      : ''
    return `- ${wer}: ${m.description ?? m.title}${art}${wie}${seit}`
  }).join('\n')
}

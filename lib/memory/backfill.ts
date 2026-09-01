/**
 * Das Gedächtnis aus der vorhandenen Geschichte füllen.
 *
 * Ohne das müsste die App bei null anfangen und wüsste erst in Wochen etwas.
 * Dabei liegen die Daten längst da: Fotos mit Orten und Markierungen seit
 * Juni, Fütterungen, Betreuungszeiträume. Was daraus folgt, lässt sich
 * ausrechnen – es braucht dafür kein Modell und kostet nichts.
 *
 * Der Unterschied zur täglichen Verschmelzung: Dort wächst Wissen langsam aus
 * einzelnen Beobachtungen, und Vorsicht ist geboten. Hier liegt die ganze
 * Historie vor, die Zahlen sind gezählt statt geschätzt. Ein Muster über
 * zwanzig Tage ist keine Vermutung mehr.
 *
 * Reine Funktionen: Was hier herauskommt, ist prüfbar, ohne eine Datenbank
 * anzufassen.
 */

import type { Memory, MemoryTyp, SubjektTyp } from './types'
import { normalisiere } from './types'

export type FotoZeile = {
  id: string
  taken_at: string
  place: string | null
  cat_ids: string[] | null
  cat_id: string | null
}

export type FuetterungsZeile = {
  logged_at: string
  food_brand: string
  food_type: string
}

export type KatzenZeile = { id: string; name: string; birthday?: string | null }

export type AbwesenheitsZeile = { starts_on: string; ends_on: string; label: string | null }

/** Deutsches Datum ohne Bibliothek – nur für die Beschreibungstexte. */
const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function deutschesDatum(tag: string): string {
  const [j, m, t] = tag.split('-')
  return `${Number(t)}. ${MONATE[Number(m) - 1] ?? m} ${j}`
}

/** Datumsschlüssel eines Zeitpunkts – hier reicht der UTC-Tag. */
const tagVon = (iso: string) => iso.slice(0, 10)

/** Wer ist auf diesem Foto markiert? Alte Einträge haben nur die Einzelspalte. */
const markierte = (f: FotoZeile): string[] =>
  f.cat_ids?.length ? f.cat_ids : f.cat_id ? [f.cat_id] : []

/**
 * Zuversicht aus der Anzahl beobachteter Tage.
 *
 * Deckelt bei 0.9: Auch zwanzig Tage machen aus einer Beobachtung keine
 * Gewissheit. Die Katze könnte morgen etwas anderes tun.
 */
function zuversicht(tage: number): number {
  return Math.min(0.9, Math.round((0.3 + tage * 0.06) * 100) / 100)
}

/** Ab welcher Anzahl Tage wiederholtes Vorkommen als Muster gilt. */
const MUSTER_AB = 3

/**
 * Fiel dieser Aufenthalt überwiegend in eine Betreuung?
 *
 * Der Unterschied ist bedeutsam: „Joschi ist häufig an der Bronnbacher Straße"
 * klingt nach einer Gewohnheit. Tatsächlich war er dort, weil die Menschen weg
 * waren und ihn jemand betreut hat. Ohne diesen Zusatz behauptet das
 * Gedächtnis etwas über die Katze, das in Wahrheit etwas über den Kalender der
 * Menschen ist.
 *
 * Mehrheitlich, nicht vollständig: Ein einzelner Tag davor oder danach ändert
 * nichts am Anlass.
 */
function betreuungFuer(tage: string[], abwesenheiten: AbwesenheitsZeile[]): boolean {
  if (abwesenheiten.length === 0 || tage.length === 0) return false
  const drin = tage.filter(t =>
    abwesenheiten.some(a => t >= a.starts_on && t <= a.ends_on),
  ).length
  return drin > tage.length / 2
}

function bau(
  subjectType: SubjektTyp,
  subjectId: string | null,
  memoryType: MemoryTyp,
  title: string,
  description: string,
  tage: string[],
  fotoIds: string[],
  zuversichtWert?: number,
): Memory {
  const sortiert = [...new Set(tage)].sort()
  return {
    subjectType,
    subjectId,
    memoryType,
    title: normalisiere(title),
    description,
    evidence: { fotoIds: fotoIds.slice(0, 12), tage: [...sortiert].reverse().slice(0, 40) },
    sourcePhotoIds: fotoIds.slice(0, 12),
    confidence: zuversichtWert ?? zuversicht(sortiert.length),
    occurrenceCount: sortiert.length,
    firstSeenAt: sortiert[0],
    lastSeenAt: sortiert[sortiert.length - 1],
    // Aus der vollständigen Historie gezählt – das ist keine Vermutung mehr.
    status: 'active',
    source: 'beobachtung',
  }
}

/**
 * Leitet aus der Historie ab, was die App über die Katzen wissen kann.
 *
 * Bewusst nur, was sich aus den Daten selbst ergibt: Wo sie waren, was sie
 * bekamen, wann sie erstmals zusammen zu sehen waren. Nichts über Vorlieben,
 * Charakter oder Gefühle – das steht in keinem Datensatz.
 */
export function ausHistorie(
  fotos: FotoZeile[],
  fuetterungen: FuetterungsZeile[],
  katzen: KatzenZeile[],
  abwesenheiten: AbwesenheitsZeile[] = [],
): Memory[] {
  const raus: Memory[] = []
  const nameVon = new Map(katzen.map(c => [c.id, c.name]))

  // ── Orte je Katze ────────────────────────────────────────────────────
  // Nach Tagen gezählt, nicht nach Fotos: Wer an einem Nachmittag zwanzig Mal
  // fotografiert wird, war einmal dort.
  const ortTage = new Map<string, { tage: Set<string>; fotos: string[]; ort: string; katze: string }>()

  for (const f of fotos) {
    if (!f.place) continue
    for (const katzeId of markierte(f)) {
      const key = `${katzeId}|${normalisiere(f.place)}`
      const eintrag = ortTage.get(key) ?? { tage: new Set(), fotos: [], ort: f.place, katze: katzeId }
      eintrag.tage.add(tagVon(f.taken_at))
      if (eintrag.fotos.length < 12) eintrag.fotos.push(f.id)
      ortTage.set(key, eintrag)
    }
  }

  for (const e of ortTage.values()) {
    const anzahl = e.tage.size
    if (anzahl < MUSTER_AB) continue
    const name = nameVon.get(e.katze) ?? 'Die Katze'
    const tage = [...e.tage].sort()

    // Fiel der Aufenthalt in eine Betreuung, gehört das dazugesagt. Ohne den
    // Zusatz liest sich "war acht Tage in Külsheim" wie eine Gewohnheit,
    // dabei war es ein einmaliger Anlass.
    const betreuung = betreuungFuer(tage, abwesenheiten)

    raus.push(bau(
      'cat', e.katze,
      // Niemals "Vorliebe": Eine Katze sucht sich ihren Aufenthaltsort nicht
      // aus. Wo sie war, ist ein Muster – keine Neigung.
      'pattern',
      e.ort,
      betreuung
        ? `${name} war während der Betreuung am Ort „${e.ort}"`
        : `${name} ist häufig am Ort „${e.ort}"`,
      tage, e.fotos,
    ))
  }

  // ── Neue Orte ────────────────────────────────────────────────────────
  // Das erste Mal an einem Ort ist der eigentlich interessante Teil – und die
  // Grundlage dafür, dass ein Gedanke später "erstmals" sagen darf.
  const ortErstesMal = new Map<string, { tag: string; fotoId: string; ort: string }>()
  for (const f of [...fotos].sort((a, b) => a.taken_at.localeCompare(b.taken_at))) {
    if (!f.place) continue
    const key = normalisiere(f.place)
    if (!ortErstesMal.has(key)) {
      ortErstesMal.set(key, { tag: tagVon(f.taken_at), fotoId: f.id, ort: f.place })
    }
  }

  // Der allererste Ort überhaupt ist kein Ereignis – das ist einfach der Anfang
  const nachDatum = [...ortErstesMal.values()].sort((a, b) => a.tag.localeCompare(b.tag))
  for (const e of nachDatum.slice(1)) {
    raus.push(bau(
      'household', null, 'event',
      `erstmals am ort ${e.ort}`,
      `Erstmals am Ort „${e.ort}", am ${deutschesDatum(e.tag)}`,
      [e.tag], [e.fotoId], 0.9,
    ))
  }

  // ── Erstes Foto je Katze ─────────────────────────────────────────────
  // Ein Meilenstein: Er ist passiert und bleibt wahr.
  for (const katze of katzen) {
    const ihre = fotos
      .filter(f => markierte(f).includes(katze.id))
      .sort((a, b) => a.taken_at.localeCompare(b.taken_at))
    const erstes = ihre[0]
    if (!erstes) continue
    raus.push(bau(
      'cat', katze.id, 'milestone',
      `erstes foto von ${katze.name}`,
      `Das erste Foto von ${katze.name} im Album, vom ${deutschesDatum(tagVon(erstes.taken_at))}`,
      [tagVon(erstes.taken_at)], [erstes.id], 0.95,
    ))
  }

  // ── Beide zusammen ───────────────────────────────────────────────────
  const zusammen = fotos
    .filter(f => markierte(f).length >= 2)
    .sort((a, b) => a.taken_at.localeCompare(b.taken_at))

  if (zusammen.length > 0) {
    const tage = zusammen.map(f => tagVon(f.taken_at))
    raus.push(bau(
      'pair', null, 'relationship',
      'gemeinsam auf einem foto',
      'Beide waren gemeinsam auf einem Foto zu sehen',
      tage, zusammen.map(f => f.id),
    ))

    const erstes = zusammen[0]
    raus.push(bau(
      'pair', null, 'milestone',
      'erstmals gemeinsam auf einem foto',
      `Das erste Foto mit beiden zusammen, vom ${deutschesDatum(tagVon(erstes.taken_at))}`,
      [tagVon(erstes.taken_at)], [erstes.id], 0.95,
    ))
  }

  // ── Futtersorten ─────────────────────────────────────────────────────
  // Haushalts-Sache: Gefüttert wird gemeinsam, die Sorte gilt für beide.
  const futterTage = new Map<string, { tage: Set<string>; name: string }>()
  for (const f of fuetterungen) {
    const name = f.food_type || f.food_brand
    if (!name) continue
    const key = normalisiere(name)
    const eintrag = futterTage.get(key) ?? { tage: new Set(), name }
    eintrag.tage.add(tagVon(f.logged_at))
    futterTage.set(key, eintrag)
  }

  // Nur die häufigsten Sorten, und ausdrücklich nicht als Vorliebe: Was im
  // Napf landet, entscheiden die Menschen. Die am häufigsten gefütterte Sorte
  // ist bei diesem Haushalt sogar die am schlechtesten vertragene – sie eine
  // Vorliebe der Katzen zu nennen wäre schlicht falsch.
  const haeufigste = [...futterTage.values()]
    .filter(e => e.tage.size >= 5)
    .sort((a, b) => b.tage.size - a.tage.size)
    .slice(0, 3)

  for (const e of haeufigste) {
    raus.push(bau(
      'household', null, 'fact',
      `futter ${e.name}`,
      `„${e.name}" gehört zu den am häufigsten gefütterten Sorten`,
      [...e.tage], [],
    ))
  }

  return raus
}

/**
 * Führt Abgeleitetes mit dem vorhandenen Bestand zusammen.
 *
 * Was ein Mensch korrigiert hat, bleibt unangetastet – auch dann, wenn die
 * Historie etwas anderes nahelegt. Und ein bereits vorhandener Eintrag mit
 * mehr Vorkommnissen wird nicht kleingerechnet: Die Ableitung kennt nur, was
 * in Fotos und Fütterungen steht, das tägliche Gedächtnis auch die
 * Bildanalyse.
 */
export function verbindeMitBestand(abgeleitet: Memory[], bestand: Memory[]): Memory[] {
  const vorhanden = new Map(
    bestand.map(m => [`${m.subjectType}|${m.subjectId ?? '-'}|${m.title}`, m]),
  )

  return abgeleitet.filter(neu => {
    const alt = vorhanden.get(`${neu.subjectType}|${neu.subjectId ?? '-'}|${neu.title}`)
    if (!alt) return true
    if (alt.source === 'nutzer') return false
    return neu.occurrenceCount > alt.occurrenceCount
  })
}

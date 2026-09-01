/**
 * Das Gedächtnis lesen und schreiben.
 *
 * Bewusst die einzige Datei in diesem Ordner, die eine Datenbank kennt. Alles
 * andere sind reine Funktionen und deshalb prüfbar, ohne einen Tag zu
 * simulieren. Was hier passiert, ist absichtlich langweilig: Zeilen holen,
 * Zeilen schreiben, Formen übersetzen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { schluessel, type Aenderung, type Memory } from './types'

type DbClient = Pick<SupabaseClient, 'from'>

/** Datenbankzeile → Erinnerung. */
function ausZeile(z: Record<string, unknown>): Memory {
  return {
    id: z.id as string,
    subjectType: z.subject_type as Memory['subjectType'],
    subjectId: (z.subject_id as string | null) ?? null,
    memoryType: z.memory_type as Memory['memoryType'],
    title: z.title as string,
    description: (z.description as string | null) ?? null,
    evidence: (z.evidence as Memory['evidence']) ?? { fotoIds: [], tage: [] },
    sourcePhotoIds: (z.source_photo_ids as string[]) ?? [],
    confidence: Number(z.confidence ?? 0),
    occurrenceCount: Number(z.occurrence_count ?? 1),
    firstSeenAt: String(z.first_seen_at ?? '').slice(0, 10),
    lastSeenAt: String(z.last_seen_at ?? '').slice(0, 10),
    status: z.status as Memory['status'],
    source: z.source as Memory['source'],
  }
}

/** Erinnerung → Datenbankzeile. */
function zuZeile(m: Memory, modell: string | null, promptFassung: string | null) {
  return {
    subject_type: m.subjectType,
    subject_id: m.subjectId,
    memory_type: m.memoryType,
    title: m.title,
    description: m.description,
    evidence: m.evidence,
    source_photo_ids: m.sourcePhotoIds,
    confidence: m.confidence,
    occurrence_count: m.occurrenceCount,
    // Datumsschlüssel zu Zeitpunkten machen – mittags, damit keine
    // Zeitzonenverschiebung den Tag kippt.
    first_seen_at: `${m.firstSeenAt}T12:00:00Z`,
    last_seen_at: `${m.lastSeenAt}T12:00:00Z`,
    status: m.status,
    source: m.source,
    model_version: modell,
    prompt_version: promptFassung,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Holt die Erinnerungen, die für heute infrage kommen.
 *
 * Nicht alles: Verblasstes und Ersetztes fließt in keinen Satz mehr ein, und
 * es Tag für Tag mitzuladen wäre reine Last. Die Obergrenze ist großzügig –
 * ausgewählt wird danach in select.ts, mit Blick auf den heutigen Tag.
 */
export async function ladeBrauchbare(db: DbClient, hoechstens = 300): Promise<Memory[]> {
  const { data, error } = await db
    .from('cat_memories')
    .select('*')
    .in('status', ['active', 'tentative'])
    .order('last_seen_at', { ascending: false })
    .limit(hoechstens)

  if (error) throw new Error(`Gedächtnis nicht lesbar: ${error.message}`)
  return (data ?? []).map(ausZeile)
}

/**
 * Schreibt die Änderungen eines Tages.
 *
 * Nur was sich geändert hat – "unveraendert" wird übersprungen. Bei einem
 * Neuwürfeln desselben Tages entsteht dadurch gar kein Schreibzugriff.
 */
export async function speichere(
  db: DbClient,
  aenderungen: Aenderung[],
  modell: string | null,
  promptFassung: string | null,
): Promise<{ neu: number; verstaerkt: number }> {
  const zuSchreiben = aenderungen.filter(a => a.art !== 'unveraendert')
  if (zuSchreiben.length === 0) return { neu: 0, verstaerkt: 0 }

  const { error } = await db
    .from('cat_memories')
    .upsert(
      zuSchreiben.map(a => zuZeile(a.memory, modell, promptFassung)),
      { onConflict: 'subject_type,subject_id,title' },
    )

  if (error) throw new Error(`Gedächtnis nicht schreibbar: ${error.message}`)

  return {
    neu: zuSchreiben.filter(a => a.art === 'neu').length,
    verstaerkt: zuSchreiben.filter(a => a.art === 'verstaerkt').length,
  }
}

/** Schreibt zurück, was verblasst ist. */
export async function speichereVeraltet(db: DbClient, vorher: Memory[], nachher: Memory[]) {
  const alt = new Map(vorher.map(m => [schluessel(m), m.status]))
  const geaendert = nachher.filter(m => alt.get(schluessel(m)) !== m.status && m.id)
  if (geaendert.length === 0) return 0

  for (const m of geaendert) {
    await db.from('cat_memories').update({ status: m.status, updated_at: new Date().toISOString() }).eq('id', m.id!)
  }
  return geaendert.length
}

/**
 * Wann wurde welche Erinnerung zuletzt in einem Gedanken verwendet?
 *
 * Grundlage für die Ruhezeit der Running Gags. Sechzig Tage reichen: Die
 * längste Sperre ist deutlich kürzer.
 */
export async function ladeVerwendungen(db: DbClient): Promise<Record<string, string>> {
  const { data } = await db
    .from('cat_thoughts')
    .select('tag, used_memory_ids')
    .order('tag', { ascending: false })
    .limit(60)

  const zuletzt: Record<string, string> = {}
  for (const zeile of data ?? []) {
    const tag = String((zeile as { tag: string }).tag).slice(0, 10)
    for (const id of ((zeile as { used_memory_ids?: string[] }).used_memory_ids ?? [])) {
      // Die Liste kommt absteigend – der erste Treffer ist der jüngste
      if (!zuletzt[id]) zuletzt[id] = tag
    }
  }
  return zuletzt
}

/** Die zuletzt geschriebenen Sätze – Grundlage für die Wiederholungsprüfung. */
export async function ladeLetzteSaetze(db: DbClient, anzahl = 14): Promise<string[]> {
  const { data } = await db
    .from('cat_thoughts')
    .select('text')
    .order('tag', { ascending: false })
    .limit(anzahl * 3)

  return (data ?? []).map(z => String((z as { text: string }).text))
}

/**
 * Wie hat jede Stimme zuletzt geklungen?
 *
 * Damit Joschi nicht nächste Woche wie Bella klingt. Feste Beispielsätze in
 * der Anweisung geben den Grundton vor, aber sie ändern sich nie – ein
 * Charakter, der sich über Monate nicht bewegt, ist eine Schablone. Die
 * eigenen letzten Sätze dazuzunehmen verankert den Ton in dem, was tatsächlich
 * schon dastand.
 *
 * Nur von der KI erzeugte: Die Ersatzsätze stammen aus einer festen Liste und
 * würden sich selbst verstärken, bis alles nach ihnen klingt.
 */
export async function ladeStimmbeispiele(
  db: DbClient,
  proStimme = 3,
): Promise<Record<string, string[]>> {
  const { data } = await db
    .from('cat_thoughts')
    .select('stimme, text, tag')
    .eq('erzeugt_von', 'ki')
    .order('tag', { ascending: false })
    .limit(proStimme * 8)

  const nach: Record<string, string[]> = {}
  for (const z of data ?? []) {
    const zeile = z as { stimme: string; text: string }
    const liste = nach[zeile.stimme] ?? []
    if (liste.length < proStimme) {
      liste.push(zeile.text)
      nach[zeile.stimme] = liste
    }
  }
  return nach
}

/** Legt die Tageszusammenfassung ab, damit die Rohdaten nicht erneut durchsucht werden müssen. */
export async function speichereTagesbild(
  db: DbClient,
  tag: string,
  beobachtungen: unknown[],
  kennzahlen: Record<string, unknown>,
  fotoAnzahl: number,
) {
  await db.from('cat_day_summaries').upsert(
    {
      tag,
      observations: beobachtungen,
      kennzahlen,
      photo_count: fotoAnzahl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tag' },
  )
}

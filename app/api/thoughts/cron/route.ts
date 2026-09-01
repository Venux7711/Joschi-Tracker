import { NextRequest, NextResponse } from 'next/server'
import { addBerlinDays, berlinDateKey } from '@/lib/time'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { erzeuge, makeAdmin } from '@/lib/thoughts-engine'

/**
 * Der nächtliche Lauf.
 *
 * Bis hierher entstanden Gedanken und Beobachtungen nur, wenn jemand das
 * Dashboard öffnete. Das war nicht bloß unsauber, sondern ein Datenverlust:
 * Die Erzeugung fragt immer nach gestern. Wer drei Tage nicht hineinsah,
 * verlor die Beobachtungen dieser drei Tage endgültig – und mit ihnen die
 * Muster, die daraus hätten wachsen können.
 *
 * Deshalb holt dieser Lauf auch nach. Er sieht ein paar Tage zurück und
 * bearbeitet die, an denen etwas passiert ist, aber nichts gespeichert wurde.
 *
 * Nebeneffekt, der die Bedienung angenehmer macht: Morgens steht der Gedanke
 * schon da, statt beim ersten Öffnen zehn Sekunden zu entstehen.
 */

// Mehrere Tage nacheinander mit Bildanalyse – das braucht Zeit.
export const maxDuration = 300

/**
 * Wie weit zurückgesehen wird, und wie viele Tage je Lauf.
 *
 * Sieben Tage Rückschau, aber höchstens drei Tage je Lauf: Jeder Tag kostet
 * einen Modellaufruf mit Bildern. Nach einem längeren Ausfall arbeitet sich
 * der Lauf über mehrere Nächte durch, statt auf einen Schlag zu bezahlen und
 * dabei ins Zeitlimit zu laufen.
 */
const RUECKSCHAU_TAGE = 7
const HOECHSTENS_JE_LAUF = 3

export async function GET(req: NextRequest) {
  if (!await isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = makeAdmin()
  const jetzt = new Date()

  // Welche Tage haben schon Gedanken?
  const aeltester = berlinDateKey(addBerlinDays(jetzt, -RUECKSCHAU_TAGE))
  const { data: vorhandene } = await admin
    .from('cat_thoughts')
    .select('tag')
    .gte('tag', aeltester)

  const fertig = new Set((vorhandene ?? []).map(z => String((z as { tag: string }).tag).slice(0, 10)))

  const erledigt: string[] = []
  const uebersprungen: string[] = []

  // Von gestern rückwärts: Der jüngste Tag ist der wichtigste, er steht
  // morgen früh auf dem Dashboard.
  for (let zurueck = 1; zurueck <= RUECKSCHAU_TAGE; zurueck++) {
    if (erledigt.length >= HOECHSTENS_JE_LAUF) break

    const datum = addBerlinDays(jetzt, -zurueck)
    const tag = berlinDateKey(datum)
    if (fertig.has(tag)) continue

    // Tage ohne jedes Geschehen auslassen. Ein Modellaufruf für einen Tag,
    // an dem weder gefüttert noch fotografiert wurde, kostet nur Geld – und
    // der Ersatztext dazu wäre ohnehin inhaltsleer.
    const [{ count: fotos }, { count: futter }] = await Promise.all([
      admin.from('photos').select('id', { count: 'exact', head: true })
        .gte('taken_at', `${tag}T00:00:00Z`).lte('taken_at', `${tag}T23:59:59Z`),
      admin.from('feeding_logs').select('id', { count: 'exact', head: true })
        .gte('logged_at', `${tag}T00:00:00Z`).lte('logged_at', `${tag}T23:59:59Z`),
    ])

    if (!fotos && !futter) {
      uebersprungen.push(tag)
      continue
    }

    try {
      await erzeuge(admin, datum, tag)
      erledigt.push(tag)
      console.log(`Gedanken für ${tag} erzeugt`)
    } catch (e) {
      console.error(`Gedanken für ${tag} fehlgeschlagen:`, e)
    }
  }

  return NextResponse.json({ erledigt, uebersprungen, geprueft: RUECKSCHAU_TAGE })
}

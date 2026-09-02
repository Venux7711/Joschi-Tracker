import { NextRequest, NextResponse } from 'next/server'
import { addBerlinDays, berlinDateKey } from '@/lib/time'
import { isAuthorizedCron } from '@/lib/cron-auth'
import {
  erzeuge, makeAdmin, tagesFenster, wochenFenster, monatsFenster, damalsFenster,
  type Fenster,
} from '@/lib/thoughts-engine'
import { STIMMEN } from '@/lib/thoughts'

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

/**
 * Ab wann nichts Neues mehr begonnen wird.
 *
 * Die Funktion darf 300 Sekunden laufen, ein Durchgang mit Bildern kostet
 * zwanzig bis vierzig. Ohne Bremse würde der letzte Durchgang mitten im
 * Modellaufruf abgeschnitten – und weil erst am Ende gespeichert wird, wäre
 * die Zeit dann vollständig verloren.
 */
const SPAETESTENS_MS = 210_000

export async function GET(req: NextRequest) {
  if (!await isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const begonnen = Date.now()
  const nochZeit = () => Date.now() - begonnen < SPAETESTENS_MS

  const admin = makeAdmin()
  const jetzt = new Date()

  // Welche Tage haben schon Gedanken?
  const aeltester = berlinDateKey(addBerlinDays(jetzt, -RUECKSCHAU_TAGE))
  const { data: vorhandene } = await admin
    .from('cat_thoughts')
    .select('tag')
    .eq('zeitraum', 'tag')
    .gte('tag', aeltester)

  const fertig = new Set((vorhandene ?? []).map(z => String((z as { tag: string }).tag).slice(0, 10)))

  const erledigt: string[] = []
  const uebersprungen: string[] = []

  // Von gestern rückwärts: Der jüngste Tag ist der wichtigste, er steht
  // morgen früh auf dem Dashboard.
  for (let zurueck = 1; zurueck <= RUECKSCHAU_TAGE; zurueck++) {
    if (erledigt.length >= HOECHSTENS_JE_LAUF || !nochZeit()) break

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
      await erzeuge(admin, tagesFenster(datum))
      erledigt.push(tag)
      console.log(`Gedanken für ${tag} erzeugt`)
    } catch (e) {
      console.error(`Gedanken für ${tag} fehlgeschlagen:`, e)
    }
  }

  /**
   * Die Rückblicke danach – und ausdrücklich danach.
   *
   * Der gestrige Tag ist das, was morgens auf dem Dashboard steht; er hat
   * Vorrang vor allem anderen. Die Woche und der Griff ins Archiv sind
   * Zugaben, die auch eine Nacht später entstehen dürfen.
   *
   * Nachts erzeugt statt beim ersten Antippen: Ein Wochenrückblick kostet
   * denselben Modellaufruf wie ein Tag. Wer auf "Die Woche" tippt, soll den
   * Text sofort sehen.
   */
  const gestern = addBerlinDays(jetzt, -1)
  const damals = await damalsFenster(admin, jetzt).catch(() => null)
  const rueckblicke: Fenster[] = [
    wochenFenster(gestern),
    monatsFenster(gestern),
    ...(damals ? [damals] : []),
  ]

  for (const fenster of rueckblicke) {
    if (!nochZeit()) break

    const { count } = await admin.from('cat_thoughts')
      .select('id', { count: 'exact', head: true })
      .eq('tag', fenster.tag).eq('zeitraum', fenster.zeitraum)
    if ((count ?? 0) >= STIMMEN.length) continue

    try {
      await erzeuge(admin, fenster)
      erledigt.push(`${fenster.zeitraum}/${fenster.tag}`)
      console.log(`Rückblick ${fenster.zeitraum} für ${fenster.tag} erzeugt`)
    } catch (e) {
      console.error(`Rückblick ${fenster.zeitraum} fehlgeschlagen:`, e)
    }
  }

  return NextResponse.json({ erledigt, uebersprungen, geprueft: RUECKSCHAU_TAGE })
}

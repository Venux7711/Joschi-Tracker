import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { addBerlinDays } from '@/lib/time'
import { STIMMEN, istZeitraum, type Zeitraum } from '@/lib/thoughts'
import {
  erzeuge, makeAdmin, alsAntwort,
  tagesFenster, wochenFenster, monatsFenster, damalsFenster,
  type Fenster, type Karte,
} from '@/lib/thoughts-engine'

// Bilder herunterladen und ein Modell mit Bildern befragen dauert länger als
// eine reine Textanfrage.
export const maxDuration = 60

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
}

async function nutzer() {
  const { data: { user } } = await makeSupabase().auth.getUser()
  return user
}

/**
 * Welche Zeiträume es heute gibt.
 *
 * 'damals' fehlt, solange die App noch keine Vergangenheit hat, in die sich
 * greifen ließe. Der Knopf wird dann gar nicht erst angeboten.
 */
async function fensterHeute(admin: ReturnType<typeof makeAdmin>): Promise<Fenster[]> {
  const jetzt = new Date()
  const gestern = addBerlinDays(jetzt, -1)
  const damals = await damalsFenster(admin, jetzt).catch(() => null)
  return [
    tagesFenster(gestern),
    wochenFenster(gestern),
    monatsFenster(gestern),
    ...(damals ? [damals] : []),
  ]
}

/** Das Gespeicherte zu einem Fenster – oder null, wenn es noch nichts gibt. */
async function ausDemArchiv(
  admin: ReturnType<typeof makeAdmin>,
  fenster: Fenster,
): Promise<Karte | null> {
  const { data } = await admin.from('cat_thoughts')
    .select('stimme, text, erzeugt_von, foto_url, foto_id, zeilen')
    .eq('tag', fenster.tag)
    .eq('zeitraum', fenster.zeitraum)

  if (!data || data.length < STIMMEN.length) return null
  return alsAntwort(fenster, data[0].erzeugt_von, data)
}

/**
 * Alles, was die Karte braucht – in einer Anfrage.
 *
 * Bewusst nicht drei Aufrufe. Wer auf "Die Woche" tippt, soll den Text sofort
 * sehen und nicht erst einen Ladebalken; das geht nur, wenn beim ersten
 * Zeichnen schon alles da ist, was nachts erzeugt wurde.
 *
 * Erzeugt wird hier trotzdem nur ein einziger Zeitraum: das Tagesfenster, und
 * auch das nur, wenn der nächtliche Lauf ausgefallen ist. Drei Modellaufrufe
 * hintereinander überschreiten das Zeitlimit dieser Funktion, und niemand
 * wartet eine Minute auf eine Karte. Fehlt ein Rückblick, holt ihn die App
 * gezielt nach – dann weiß der Mensch auch, worauf er wartet.
 */
export async function GET(req: NextRequest) {
  if (!await nutzer()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()

  // Archiv: die letzten Tage zum Zurückblättern
  if (req.nextUrl.searchParams.get('archiv') === '1') {
    const { data } = await admin.from('cat_thoughts')
      .select('tag, zeitraum, stimme, text').order('tag', { ascending: false }).limit(90)
    return NextResponse.json({ archiv: data ?? [] })
  }

  const fenster = await fensterHeute(admin)
  const gewuenscht = req.nextUrl.searchParams.get('zeitraum')

  /**
   * Ein einzelner Zeitraum, ausdrücklich angefordert.
   *
   * Diesen Weg geht die App, wenn jemand auf einen Zeitraum tippt, für den
   * noch nichts vorliegt. Hier darf erzeugt werden – der Mensch hat die
   * Wartezeit selbst ausgelöst und sieht, worauf er wartet.
   */
  if (istZeitraum(gewuenscht)) {
    const ziel = fenster.find(f => f.zeitraum === gewuenscht)
    if (!ziel) return NextResponse.json({ error: 'Zeitraum nicht verfügbar' }, { status: 404 })
    const vorhanden = await ausDemArchiv(admin, ziel)
    return NextResponse.json(vorhanden ?? await erzeuge(admin, ziel))
  }

  const karten = await Promise.all(fenster.map(f => ausDemArchiv(admin, f)))

  // Der Tageszeitraum ist der einzige, der niemals fehlen darf: Er ist die
  // Voreinstellung der Karte.
  if (!karten[0]) karten[0] = await erzeuge(admin, fenster[0])

  return NextResponse.json({
    zeitraeume: fenster.map((f, i) => ({
      key: f.zeitraum,
      titel: f.titel,
      // Was noch nicht erzeugt ist, wird beim Antippen nachgeholt. Die App
      // zeigt dafür einen eigenen Zustand statt einer leeren Karte.
      bereit: karten[i] !== null,
    })),
    karten: Object.fromEntries(
      fenster.map((f, i) => [f.zeitraum, karten[i]]).filter(([, k]) => k !== null),
    ),
  })
}

/**
 * Nochmal würfeln.
 *
 * Bei einem Gag-Feature ist das kein Luxus: Ein misslungener Satz stünde sonst
 * bis zum nächsten Tag da. Der alte wird dabei überschrieben – ein Archiv aus
 * verworfenen Versuchen hilft niemandem.
 */
export async function POST(req: NextRequest) {
  if (!await nutzer()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()
  const roh = await req.json().catch(() => ({})) as { zeitraum?: unknown }
  const gewuenscht: Zeitraum = istZeitraum(roh.zeitraum) ? roh.zeitraum : 'tag'

  const ziel = (await fensterHeute(admin)).find(f => f.zeitraum === gewuenscht)
  if (!ziel) return NextResponse.json({ error: 'Zeitraum nicht verfügbar' }, { status: 404 })

  await admin.from('cat_thoughts').delete().eq('tag', ziel.tag).eq('zeitraum', ziel.zeitraum)

  // Beim Würfeln auch andere Fotos vorlegen. Aus der Uhrzeit abgeleitet:
  // Ein fester Wert brächte beim zweiten Wurf wieder dieselben Bilder, und
  // genau das war die Klage.
  const versatz = (Math.floor(Date.now() / 1000) % 7) + 1
  return NextResponse.json(await erzeuge(admin, ziel, versatz))
}

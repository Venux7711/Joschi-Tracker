import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { addBerlinDays, berlinDateKey } from '@/lib/time'
import { STIMMEN } from '@/lib/thoughts'
import { erzeuge, makeAdmin } from '@/lib/thoughts-engine'

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

export async function GET(req: NextRequest) {
  if (!await nutzer()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()
  const gestern = addBerlinDays(new Date(), -1)
  const tag = berlinDateKey(gestern)

  // Archiv: die letzten Tage zum Zurückblättern
  if (req.nextUrl.searchParams.get('archiv') === '1') {
    const { data } = await admin.from('cat_thoughts')
      .select('tag, stimme, text').order('tag', { ascending: false }).limit(90)
    return NextResponse.json({ archiv: data ?? [] })
  }

  const { data: vorhanden } = await admin.from('cat_thoughts')
    .select('stimme, text, erzeugt_von, foto_url, foto_id, zeilen').eq('tag', tag)

  if (vorhanden && vorhanden.length >= STIMMEN.length) {
    return NextResponse.json({
      tag,
      quelle: vorhanden[0].erzeugt_von,
      gedanken: Object.fromEntries(
        vorhanden.map(z => [z.stimme, {
          text: z.text, foto: z.foto_url, fotoId: z.foto_id, zeilen: z.zeilen ?? [],
        }]),
      ),
    })
  }

  // Der Zeitgeber sollte die Gedanken nachts erzeugt haben. Ist doch keiner da –
  // etwa weil der Lauf ausgefallen ist –, entsteht er hier.
  return NextResponse.json(await erzeuge(admin, gestern, tag))
}

/**
 * Nochmal würfeln.
 *
 * Bei einem Gag-Feature ist das kein Luxus: Ein misslungener Satz stünde sonst
 * bis zum nächsten Tag da. Der alte wird dabei überschrieben – ein Archiv aus
 * verworfenen Versuchen hilft niemandem.
 */
export async function POST() {
  if (!await nutzer()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()
  const gestern = addBerlinDays(new Date(), -1)
  const tag = berlinDateKey(gestern)

  await admin.from('cat_thoughts').delete().eq('tag', tag)

  // Beim Würfeln auch andere Fotos vorlegen. Aus der Uhrzeit abgeleitet:
  // Ein fester Wert brächte beim zweiten Wurf wieder dieselben Bilder, und
  // genau das war die Klage.
  const versatz = (Math.floor(Date.now() / 1000) % 7) + 1
  return NextResponse.json(await erzeuge(admin, gestern, tag, versatz))
}

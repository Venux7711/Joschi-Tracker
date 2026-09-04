import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { erzeugeAbleitungen } from '@/lib/bilder'

/**
 * Rechnet die verkleinerten Fassungen der Bestandsfotos nach.
 *
 * Neue Fotos bekommen ihre Fassungen beim Hochladen. Die 99, die schon da
 * waren, brauchen einen Durchlauf – und der gehört nicht in eine Anfrage, die
 * jemand abwartet.
 *
 * Läuft stündlich, bis nichts mehr offen ist, und danach kostenlos weiter: Ist
 * die Liste leer, ist der Lauf nach einer Abfrage vorbei.
 */

// Bilder herunterladen, zweimal umrechnen, wieder hochladen – je Foto ein paar
// Sekunden.
export const maxDuration = 300

function makeAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

/**
 * Wie viele Fotos je Lauf, und ab wann nichts Neues mehr begonnen wird.
 *
 * Ein Durchgang kostet zwei bis fünf Sekunden. Dreißig passen bequem in die
 * Zeit, und die Zeitbremse fängt den Ausreißer ab – ohne sie würde der letzte
 * Durchgang mitten im Hochladen abgeschnitten und die Arbeit wäre verloren.
 */
const HOECHSTENS_JE_LAUF = 30
const SPAETESTENS_MS = 240_000

export async function GET(req: NextRequest) {
  if (!await isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const begonnen = Date.now()
  const admin = makeAdmin()

  /**
   * Was noch offen ist.
   *
   * Videos haben kein eigenes Bild, wohl aber ein Standbild – das wird
   * verkleinert, denn in Kacheln und Streifen steht genau dieses. Einträge
   * ohne jede Quelle fallen weg, und was schon einmal gescheitert ist, wird
   * nicht endlos wiederholt.
   */
  const { data: offen, error } = await admin.from('photos')
    .select('id, public_url, poster_url, media_type')
    .is('thumb_url', null)
    .is('derivate_state', null)
    .order('taken_at', { ascending: false })
    .limit(HOECHSTENS_JE_LAUF)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const fertig: string[] = []
  const gescheitert: string[] = []

  for (const foto of offen ?? []) {
    if (Date.now() - begonnen > SPAETESTENS_MS) break

    const quelle = foto.media_type === 'video' ? foto.poster_url : foto.public_url
    if (!quelle) {
      // Ein Video ohne Standbild kann hier nichts werden. Als gescheitert
      // vermerken, sonst käme es in jedem Lauf wieder hoch.
      await admin.from('photos').update({ derivate_state: 'fehler' }).eq('id', foto.id)
      gescheitert.push(foto.id)
      continue
    }

    const fassungen = await erzeugeAbleitungen(admin, foto.id, quelle)
    if (!fassungen) {
      await admin.from('photos').update({ derivate_state: 'fehler' }).eq('id', foto.id)
      gescheitert.push(foto.id)
      continue
    }

    await admin.from('photos')
      .update({ ...fassungen, derivate_state: 'fertig' })
      .eq('id', foto.id)
    fertig.push(foto.id)
  }

  // Wie viel noch aussteht – daran ist im Protokoll abzulesen, ob der Nachlauf
  // vorankommt oder sich im Kreis dreht.
  const { count: rest } = await admin.from('photos')
    .select('id', { count: 'exact', head: true })
    .is('thumb_url', null)
    .is('derivate_state', null)

  return NextResponse.json({
    fertig: fertig.length,
    gescheitert: gescheitert.length,
    offen: rest ?? 0,
  })
}

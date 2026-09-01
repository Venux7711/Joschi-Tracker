import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Cat } from '@/lib/types'

/**
 * Die Chronik: was in diesem Haushalt bisher passiert ist.
 *
 * Streng nur Ereignisse und Meilensteine – nichts, was sich wiederholt. Ein
 * Muster wie „liegt oft auf dem Sofa" hat kein Datum und gehört deshalb nicht
 * auf eine Zeitleiste. Ohne diese Strenge wird daraus schnell ein
 * Datenfriedhof, durch den niemand scrollt.
 *
 * Zusammengesetzt aus drei Quellen: den Meilensteinen des Gedächtnisses, den
 * Geburtstagen und den Betreuungszeiträumen. Alle drei sind belegt – nichts
 * davon ist gedeutet.
 */

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
}

function makeAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export type ChronikPunkt = {
  id: string
  tag: string
  titel: string
  wer: string | null
  art: 'geburt' | 'meilenstein' | 'ereignis' | 'betreuung'
  fotoUrl: string | null
  fotoId: string | null
  /** Nur bei Zeiträumen gesetzt. */
  bis: string | null
}

export async function GET() {
  const { data: { user } } = await makeSupabase().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()

  const [{ data: catRows }, { data: memRows }, { data: absenceRows }] = await Promise.all([
    admin.from('cats').select('id, name, birthday').order('created_at', { ascending: true }),
    admin.from('cat_memories')
      .select('id, subject_type, subject_id, memory_type, description, title, first_seen_at, source_photo_ids')
      .in('memory_type', ['milestone', 'event'])
      // Verworfenes gehört nicht in die Geschichte – wer es richtiggestellt
      // hat, wollte es dort gerade nicht sehen.
      .neq('status', 'superseded')
      .order('first_seen_at', { ascending: true })
      .limit(200),
    admin.from('absences').select('id, starts_on, ends_on, label'),
  ])

  const cats = (catRows ?? []) as Cat[]
  const namen = Object.fromEntries(cats.map(c => [c.id, c.name]))

  // Die Bilder zu den Meilensteinen in einem Zug holen statt je Punkt einzeln
  const fotoIds = Array.from(new Set(
    (memRows ?? []).flatMap(m => (m.source_photo_ids as string[] | null) ?? []).slice(0, 200),
  ))
  const { data: fotoRows } = fotoIds.length
    ? await admin.from('photos').select('id, public_url, poster_url, media_type').in('id', fotoIds)
    : { data: [] }

  const fotoVon = new Map(
    (fotoRows ?? []).map(f => [
      f.id as string,
      (f.media_type === 'video' ? f.poster_url : f.public_url) as string | null,
    ]),
  )

  const punkte: ChronikPunkt[] = []

  // Geburtstage: der Anfang jeder Geschichte
  for (const c of cats) {
    if (!c.birthday) continue
    punkte.push({
      id: `geburt-${c.id}`,
      tag: c.birthday,
      titel: `${c.name} wird geboren`,
      wer: c.name,
      art: 'geburt',
      fotoUrl: c.photo_url ?? null,
      fotoId: null,
      bis: null,
    })
  }

  for (const m of memRows ?? []) {
    const erstesFoto = ((m.source_photo_ids as string[] | null) ?? [])[0] ?? null
    punkte.push({
      id: m.id as string,
      tag: String(m.first_seen_at).slice(0, 10),
      titel: (m.description as string | null) ?? (m.title as string),
      wer: m.subject_type === 'pair' ? 'Beide'
        : m.subject_type === 'household' ? null
        : namen[m.subject_id as string] ?? null,
      art: m.memory_type === 'milestone' ? 'meilenstein' : 'ereignis',
      fotoUrl: erstesFoto ? fotoVon.get(erstesFoto) ?? null : null,
      fotoId: erstesFoto,
      bis: null,
    })
  }

  for (const a of absenceRows ?? []) {
    punkte.push({
      id: `betreuung-${a.id}`,
      tag: a.starts_on as string,
      titel: (a.label as string | null) ?? 'Betreuung',
      wer: null,
      art: 'betreuung',
      fotoUrl: null,
      fotoId: null,
      bis: a.ends_on as string,
    })
  }

  punkte.sort((a, b) => a.tag.localeCompare(b.tag))

  return NextResponse.json({ punkte })
}

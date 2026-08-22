import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getActiveCat } from '@/lib/active-cat.server'
import { berlinDayStart, berlinDayEnd, fromBerlinInputValue } from '@/lib/time'
import { notifyNewPhoto } from '@/lib/notifications'

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
}

/**
 * Client OHNE Nutzer-Session: Weil makeSupabase() das Session-Cookie mitschickt,
 * greift dort RLS als angemeldeter Nutzer – und photos hat gar keine
 * UPDATE-Policy (002 legt nur SELECT/INSERT/DELETE an), Löschen ist zudem auf
 * den Uploader beschränkt. Markieren/Löschen lief deshalb ins Leere.
 *
 * Die Autorisierung passiert in der Route selbst: ohne angemeldeten Nutzer 401,
 * und die App hat keinen öffentlichen Signup – alle eingeladenen Nutzer teilen
 * denselben Haushalt und dieselbe Fotobibliothek. Damit funktionieren Schreib-
 * zugriffe unabhängig davon, ob die Haushalts-Policies schon eingespielt sind.
 */
function makeAdminSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

/**
 * Die Spalte cat_ids kommt erst mit Migration 008. Solange die noch nicht auf
 * der Datenbank liegt, arbeitet die Route auf der alten Einzelspalte cat_id
 * weiter – sonst schlagen Hochladen und Markieren fehl. Nur der Positiv-Fall
 * wird gecacht, damit die App die Spalte ohne Redeploy übernimmt, sobald die
 * Migration eingespielt ist.
 */
let catIdsColumnReady = false

async function hasCatIdsColumn(supabase: ReturnType<typeof makeSupabase>): Promise<boolean> {
  if (catIdsColumnReady) return true
  const { error } = await supabase.from('photos').select('cat_ids').limit(1)
  catIdsColumnReady = !error
  return catIdsColumnReady
}

/**
 * Liest die Katzen-Markierung aus dem Request. Akzeptiert cat_ids (neu, mehrere
 * Katzen) und cat_id (alt, eine Katze), gibt null zurück wenn beides fehlt.
 */
function normalizeCatIds(body: { cat_ids?: unknown; cat_id?: unknown }): string[] | null {
  if (Array.isArray(body.cat_ids)) {
    return Array.from(new Set(body.cat_ids.filter((id): id is string => typeof id === 'string')))
  }
  if (body.cat_id !== undefined) {
    return typeof body.cat_id === 'string' ? [body.cat_id] : []
  }
  return null
}

export async function GET(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '100')
  const mood = req.nextUrl.searchParams.get('mood')
  const catFilter = req.nextUrl.searchParams.get('catId')    // optional: nur Fotos einer Katze
  const date = req.nextUrl.searchParams.get('date')         // YYYY-MM-DD exact day
  const startDate = req.nextUrl.searchParams.get('startDate') // YYYY-MM-DD range start
  const endDate = req.nextUrl.searchParams.get('endDate')     // YYYY-MM-DD range end

  // Gemeinsame Fotobibliothek: keine Filterung nach aktiver Katze. cat_ids ist nur
  // noch eine Markierung, wer auf dem Bild ist – explizit über ?catId= filterbar.
  let query = supabase
    .from('photos')
    .select('*')
    .order('taken_at', { ascending: false })
    .limit(limit)

  if (catFilter) {
    query = (await hasCatIdsColumn(supabase))
      ? query.contains('cat_ids', [catFilter])
      : query.eq('cat_id', catFilter)
  }
  if (mood) query = query.eq('mood_tag', mood)
  // Tagesgrenzen in Berliner Zeit auflösen – ein nacktes "2026-08-08T00:00:00"
  // würde Postgres als UTC lesen und den Tag um 2 Stunden verschieben.
  if (date) {
    query = query
      .gte('taken_at', berlinDayStart(fromBerlinInputValue(date)).toISOString())
      .lte('taken_at', berlinDayEnd(fromBerlinInputValue(date)).toISOString())
  } else if (startDate || endDate) {
    if (startDate) query = query.gte('taken_at', berlinDayStart(fromBerlinInputValue(startDate)).toISOString())
    if (endDate) query = query.lte('taken_at', berlinDayEnd(fromBerlinInputValue(endDate)).toISOString())
  }

  const { data: photos, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ photos: photos ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { storage_path, public_url, mood_tag, health_log_id, caption, taken_at } = body

  // Aufnahmeort, falls das Bild welchen mitbrachte. Plausibilität prüfen –
  // der Wert kommt aus dem Browser.
  const lat = typeof body.lat === 'number' && Math.abs(body.lat) <= 90 ? body.lat : null
  const lng = typeof body.lng === 'number' && Math.abs(body.lng) <= 180 ? body.lng : null

  // cat_ids markiert nur, wer auf dem Bild ist (mehrere möglich). Kommt keine
  // Angabe mit, wird die aktive Katze als Standard genutzt – die Sichtbarkeit
  // hängt nicht daran.
  const catIds = normalizeCatIds(body)
    ?? [(await getActiveCat(supabase))?.id].filter((id): id is string => !!id)

  const { data, error } = await supabase.from('photos').insert({
    ...((await hasCatIdsColumn(supabase)) ? { cat_ids: catIds } : {}),
    cat_id: catIds[0] ?? null,
    user_id: user.id,
    storage_path,
    public_url,
    mood_tag: mood_tag ?? 'normal',
    health_log_id: health_log_id ?? null,
    caption: caption ?? null,
    taken_at: taken_at ?? new Date().toISOString(),
    lat, lng,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Die anderen im Haushalt über das neue Bild informieren. Bewusst awaited:
  // In einer Serverless-Funktion würde ein nicht abgewarteter Aufruf mit dem
  // Ende der Antwort abgebrochen. Fehler dürfen den Upload nicht kippen –
  // das Foto liegt zu diesem Zeitpunkt bereits in der Datenbank.
  try {
    await notifyNewPhoto(user.id)
  } catch (e) {
    console.error('Foto-Benachrichtigung fehlgeschlagen:', e)
  }

  return NextResponse.json({ photo: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, mood_tag, caption } = body
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  const catIds = normalizeCatIds(body)
  if (catIds !== null) {
    // Ohne Migration 008 kann nur eine Katze markiert werden – die erste gewinnt
    if (await hasCatIdsColumn(supabase)) patch.cat_ids = catIds
    patch.cat_id = catIds[0] ?? null
  }
  if (mood_tag !== undefined) patch.mood_tag = mood_tag
  if (caption !== undefined) patch.caption = caption

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nichts zu ändern' }, { status: 400 })
  }

  // Gemeinsame Bibliothek: jeder eingeladene Nutzer darf jedes Foto markieren.
  // Kein .single(): das wirft bei 0 Treffern einen kryptischen PostgREST-Fehler
  // ("Cannot coerce the result to a single JSON object") statt einer klaren Meldung.
  const { data, error } = await makeAdminSupabase().from('photos').update(patch).eq('id', id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Foto nicht gefunden' }, { status: 404 })
  return NextResponse.json({ photo: data[0] })
}

export async function DELETE(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, storage_path } = await req.json()
  const admin = makeAdminSupabase()

  if (storage_path) {
    await admin.storage.from('joschi-photos').remove([storage_path])
  }

  // Gemeinsame Bibliothek: jeder eingeladene Nutzer darf auch Fotos des anderen
  // löschen – ohne Admin-Client verhindert das die Uploader-Policy aus 002.
  const { data, error } = await admin.from('photos').delete().eq('id', id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Foto nicht gefunden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

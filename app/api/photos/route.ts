import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getActiveCat } from '@/lib/active-cat.server'
import { berlinDayStart, berlinDayEnd, fromBerlinInputValue } from '@/lib/time'

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
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

  if (catFilter) query = query.contains('cat_ids', [catFilter])
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

  // cat_ids markiert nur, wer auf dem Bild ist (mehrere möglich). Kommt keine
  // Angabe mit, wird die aktive Katze als Standard genutzt – die Sichtbarkeit
  // hängt nicht daran.
  const catIds = normalizeCatIds(body)
    ?? [(await getActiveCat(supabase))?.id].filter((id): id is string => !!id)

  const { data, error } = await supabase.from('photos').insert({
    cat_ids: catIds,
    cat_id: catIds[0] ?? null,
    user_id: user.id,
    storage_path,
    public_url,
    mood_tag: mood_tag ?? 'normal',
    health_log_id: health_log_id ?? null,
    caption: caption ?? null,
    taken_at: taken_at ?? new Date().toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
    patch.cat_ids = catIds
    patch.cat_id = catIds[0] ?? null
  }
  if (mood_tag !== undefined) patch.mood_tag = mood_tag
  if (caption !== undefined) patch.caption = caption

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nichts zu ändern' }, { status: 400 })
  }

  // Gemeinsame Bibliothek: jeder eingeladene Nutzer darf jedes Foto markieren
  const { data, error } = await supabase.from('photos').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Foto nicht gefunden' }, { status: 404 })
  return NextResponse.json({ photo: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, storage_path } = await req.json()

  if (storage_path) {
    await supabase.storage.from('joschi-photos').remove([storage_path])
  }

  // Kein user_id-Filter: gemeinsame Bibliothek, jeder eingeladene Nutzer darf
  // auch Fotos des anderen löschen (RLS: Migration 007).
  const { data, error } = await supabase.from('photos').delete().eq('id', id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Foto nicht gefunden oder keine Berechtigung' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getActiveCat } from '@/lib/active-cat.server'

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
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

  // Gemeinsame Fotobibliothek: keine Filterung nach aktiver Katze. cat_id ist nur
  // noch eine Markierung, wer auf dem Bild ist – explizit über ?catId= filterbar.
  let query = supabase
    .from('photos')
    .select('*')
    .order('taken_at', { ascending: false })
    .limit(limit)

  if (catFilter) query = query.eq('cat_id', catFilter)
  if (mood) query = query.eq('mood_tag', mood)
  if (date) {
    query = query.gte('taken_at', `${date}T00:00:00`).lte('taken_at', `${date}T23:59:59`)
  } else if (startDate || endDate) {
    if (startDate) query = query.gte('taken_at', `${startDate}T00:00:00`)
    if (endDate) query = query.lte('taken_at', `${endDate}T23:59:59`)
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

  // cat_id markiert nur, wer auf dem Bild ist. Kommt keine Angabe mit, wird die
  // aktive Katze als Standard genutzt – die Sichtbarkeit hängt nicht daran.
  const catId = body.cat_id !== undefined
    ? body.cat_id
    : (await getActiveCat(supabase))?.id ?? null

  const { data, error } = await supabase.from('photos').insert({
    cat_id: catId,
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

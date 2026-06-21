import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  const { data: cats } = await supabase.from('cats').select('id').limit(1)
  if (!cats?.length) return NextResponse.json({ photos: [] })
  const catId = cats[0].id

  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '100')
  const mood = req.nextUrl.searchParams.get('mood')
  const date = req.nextUrl.searchParams.get('date')         // YYYY-MM-DD exact day
  const startDate = req.nextUrl.searchParams.get('startDate') // YYYY-MM-DD range start
  const endDate = req.nextUrl.searchParams.get('endDate')     // YYYY-MM-DD range end

  let query = supabase
    .from('photos')
    .select('*')
    .eq('cat_id', catId)
    .order('taken_at', { ascending: false })
    .limit(limit)

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

  const { data: cats } = await supabase.from('cats').select('id').limit(1)
  if (!cats?.length) return NextResponse.json({ error: 'Katze nicht gefunden' }, { status: 404 })
  const catId = cats[0].id

  const body = await req.json()
  const { storage_path, public_url, mood_tag, health_log_id, caption, taken_at } = body

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

  const { error } = await supabase.from('photos').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

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

export async function GET() {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cats } = await supabase.from('cats').select('id').limit(1)
  if (!cats?.length) return NextResponse.json({ weights: [] })

  const { data: weights } = await supabase
    .from('weights')
    .select('*')
    .eq('cat_id', cats[0].id)
    .order('measured_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ weights: weights ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cats } = await supabase.from('cats').select('id').limit(1)
  if (!cats?.length) return NextResponse.json({ error: 'Keine Katze' }, { status: 404 })

  const { weight_grams, notes, measured_at } = await req.json()
  const { data, error } = await supabase.from('weights').insert({
    cat_id: cats[0].id,
    user_id: user.id,
    weight_grams: parseInt(weight_grams),
    notes: notes ?? null,
    measured_at: measured_at ?? new Date().toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weight: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  await supabase.from('weights').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}

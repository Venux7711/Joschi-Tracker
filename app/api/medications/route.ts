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
  if (!cats?.length) return NextResponse.json({ medications: [] })

  const { data } = await supabase
    .from('medications')
    .select('*')
    .eq('cat_id', cats[0].id)
    .order('active', { ascending: false })
    .order('created_at', { ascending: false })

  return NextResponse.json({ medications: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cats } = await supabase.from('cats').select('id').limit(1)
  if (!cats?.length) return NextResponse.json({ error: 'Keine Katze' }, { status: 404 })

  const body = await req.json()
  const { data, error } = await supabase.from('medications').insert({
    cat_id: cats[0].id,
    user_id: user.id,
    name: body.name,
    dosage: body.dosage ?? null,
    frequency: body.frequency ?? null,
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    notes: body.notes ?? null,
    active: body.active ?? true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ medication: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()
  const { error } = await supabase.from('medications').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  await supabase.from('medications').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}

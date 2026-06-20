import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function getCatId(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from('cats').select('id').eq('owner_id', userId).single()
  return data?.id as string | undefined
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const catId = await getCatId(supabase, user.id)
  if (!catId) return NextResponse.json({ items: [] })

  const { data } = await supabase
    .from('pantry_items').select('*').eq('cat_id', catId)
    .order('brand').order('type')

  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const catId = await getCatId(supabase, user.id)
  if (!catId) return NextResponse.json({ error: 'Keine Katze gefunden' }, { status: 404 })

  const body = await req.json()
  const { data, error } = await supabase.from('pantry_items').insert({
    user_id: user.id,
    cat_id: catId,
    brand: body.brand,
    type: body.type,
    quantity: body.quantity ?? 1,
    restock_date: body.restock_date ?? null,
    notes: body.notes ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ item: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...updates } = body

  const { data, error } = await supabase.from('pantry_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  await supabase.from('pantry_items').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}

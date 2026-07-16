import { createClient } from '@/lib/supabase/server'
import { getCats } from '@/lib/active-cat.server'
import { NextRequest, NextResponse } from 'next/server'

// Vorrat ist Haushalts-, nicht Katzen-spezifisch – über alle Katzen des Besitzers.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const catIds = (await getCats(supabase)).map((c) => c.id)
  if (catIds.length === 0) return NextResponse.json({ items: [] })

  const { data } = await supabase
    .from('pantry_items').select('*').in('cat_id', catIds)
    .order('brand').order('type')

  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Welche Katze das Item "gehört" ist egal, da nie danach gefiltert wird –
  // einfach die zuerst angelegte als Anker nehmen.
  const catId = (await getCats(supabase))[0]?.id
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
    product_url: body.product_url ?? null,
    nutrition: body.nutrition ?? null,
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

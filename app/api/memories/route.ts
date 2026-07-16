import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function getCatId(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from('cats').select('id').limit(1).single()
  return data?.id as string | undefined
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const catId = await getCatId(supabase)
  if (!catId) return NextResponse.json({ memories: [] })

  const { data } = await supabase
    .from('ai_memories').select('*').eq('cat_id', catId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ memories: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const catId = await getCatId(supabase)
  if (!catId) return NextResponse.json({ error: 'Keine Katze gefunden' }, { status: 404 })

  const body = await req.json()
  const content = (body.content ?? '').trim()
  const kind = body.kind === 'instruction' ? 'instruction' : 'fact'
  if (!content) return NextResponse.json({ error: 'Inhalt fehlt' }, { status: 400 })

  const { data, error } = await supabase.from('ai_memories').insert({
    user_id: user.id,
    cat_id: catId,
    kind,
    content: content.slice(0, 500),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ memory: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  await supabase.from('ai_memories').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}

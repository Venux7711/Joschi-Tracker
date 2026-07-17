import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase.from('cats').select('*').order('created_at', { ascending: true })
  return NextResponse.json({ cats: data ?? [] })
}

// Aktuell nur zum Setzen des Profilbilds genutzt (aus CatPhoto), daher bewusst schmal gehalten.
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, photo_url } = await req.json()
  if (!id || typeof photo_url !== 'string') return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })

  const { data, error } = await supabase.from('cats')
    .update({ photo_url })
    .eq('id', id).eq('owner_id', user.id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ cat: data })
}

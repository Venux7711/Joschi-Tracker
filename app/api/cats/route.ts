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

  const body = await req.json()
  const { id, photo_url, birthday } = body
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof photo_url === 'string') patch.photo_url = photo_url
  if (birthday !== undefined) {
    // Leeres Feld = Geburtstag entfernen
    if (birthday === null || birthday === '') patch.birthday = null
    else if (typeof birthday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(birthday)) patch.birthday = birthday
    else return NextResponse.json({ error: 'Geburtstag muss YYYY-MM-DD sein' }, { status: 400 })
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nichts zu ändern' }, { status: 400 })
  }

  // Kein owner_id-Filter: Die Katzen gehören dem Haushalt, nicht dem Konto, das
  // sie angelegt hat – sonst könnten Eva und Mama weder Foto noch Geburtstag
  // pflegen. Autorisierung passiert oben über den angemeldeten Nutzer.
  const { data, error } = await supabase.from('cats')
    .update(patch)
    .eq('id', id)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data?.length) return NextResponse.json({ error: 'Katze nicht gefunden' }, { status: 404 })
  return NextResponse.json({ cat: data[0] })
}

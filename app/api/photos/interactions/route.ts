import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notifyReaction, notifyComment } from '@/lib/notifications'
import { isReaction } from '@/lib/reactions'

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
}

function makeAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

function displayName(user: { user_metadata?: Record<string, unknown>; email?: string }): string {
  const name = user.user_metadata?.display_name
  if (typeof name === 'string' && name.trim()) return name.trim()
  const local = (user.email ?? '').split('@')[0]
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Jemand'
}

/**
 * Reaktionen und Kommentare zu mehreren Fotos auf einmal – die Fotoseite lädt
 * eine ganze Liste, einzelne Abfragen pro Bild wären zu viele Rundreisen.
 */
export async function GET(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ids = (req.nextUrl.searchParams.get('photoIds') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean).slice(0, 300)
  if (ids.length === 0) return NextResponse.json({ reactions: [], comments: [], names: {} })

  const admin = makeAdmin()
  const [{ data: reactions }, { data: comments }] = await Promise.all([
    admin.from('photo_reactions').select('id, photo_id, user_id, emoji').in('photo_id', ids),
    admin.from('photo_comments').select('id, photo_id, user_id, text, created_at')
      .in('photo_id', ids).order('created_at', { ascending: true }),
  ])

  // Anzeigenamen der Beteiligten mitliefern, damit der Browser sie nicht
  // einzeln nachladen muss
  const userIds = Array.from(new Set([
    ...(reactions ?? []).map(r => r.user_id),
    ...(comments ?? []).map(c => c.user_id),
  ]))
  const names: Record<string, string> = {}
  for (const id of userIds) {
    const { data } = await admin.auth.admin.getUserById(id)
    if (data?.user) names[id] = displayName(data.user)
  }

  return NextResponse.json({
    reactions: reactions ?? [],
    comments: comments ?? [],
    names,
    me: user.id,
  })
}

export async function POST(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { photo_id, type, emoji, text } = await req.json()
  if (!photo_id) return NextResponse.json({ error: 'photo_id fehlt' }, { status: 400 })

  const admin = makeAdmin()
  const name = displayName(user)

  // ── Reaktion umschalten ───────────────────────────────────────────────────
  if (type === 'reaction') {
    if (!isReaction(emoji)) {
      return NextResponse.json({ error: 'Unbekannte Reaktion' }, { status: 400 })
    }

    const { data: vorhanden } = await admin.from('photo_reactions')
      .select('id').eq('photo_id', photo_id).eq('user_id', user.id).eq('emoji', emoji).maybeSingle()

    if (vorhanden) {
      await admin.from('photo_reactions').delete().eq('id', vorhanden.id)
      return NextResponse.json({ ok: true, aktiv: false })
    }

    const { error } = await admin.from('photo_reactions')
      .insert({ photo_id, user_id: user.id, emoji })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Nur beim Setzen melden, nicht beim Zurücknehmen. Fehler dürfen die
    // Reaktion nicht kippen – die steht zu diesem Zeitpunkt schon.
    try {
      await notifyReaction(user.id, name, emoji, photo_id)
    } catch (e) {
      console.error('Reaktions-Benachrichtigung fehlgeschlagen:', e)
    }
    return NextResponse.json({ ok: true, aktiv: true })
  }

  // ── Kommentar ─────────────────────────────────────────────────────────────
  if (type === 'comment') {
    const inhalt = typeof text === 'string' ? text.trim() : ''
    if (!inhalt) return NextResponse.json({ error: 'Kommentar ist leer' }, { status: 400 })
    if (inhalt.length > 500) return NextResponse.json({ error: 'Kommentar ist zu lang' }, { status: 400 })

    const { data, error } = await admin.from('photo_comments')
      .insert({ photo_id, user_id: user.id, text: inhalt }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    try {
      await notifyComment(user.id, name, inhalt, photo_id)
    } catch (e) {
      console.error('Kommentar-Benachrichtigung fehlgeschlagen:', e)
    }
    return NextResponse.json({ comment: data, name })
  }

  return NextResponse.json({ error: 'Unbekannter Typ' }, { status: 400 })
}

/** Eigenen Kommentar löschen. */
export async function DELETE(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  // Nur eigene – fremde Kommentare bleiben unangetastet
  const { data, error } = await makeAdmin().from('photo_comments')
    .delete().eq('id', id).eq('user_id', user.id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden oder nicht deiner' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

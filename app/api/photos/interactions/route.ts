import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notifyReaction, notifyComment, notifyCommentReaction } from '@/lib/notifications'
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
 * Anzeigenamen, zwischengespeichert.
 *
 * Vorher wurde für jeden Beteiligten einzeln und nacheinander beim Auth-Dienst
 * nachgefragt – bei jedem Öffnen eines Bildes aufs Neue. Beim Durchblättern
 * summiert sich das spürbar, obwohl der Haushalt aus drei Personen besteht,
 * deren Namen sich praktisch nie ändern.
 *
 * Eine Stunde Haltbarkeit: Wird ein Name geändert, steht er spätestens dann
 * überall richtig, und bis dahin schadet der alte niemandem.
 */
const NAMEN_HALTBAR_MS = 60 * 60 * 1000
const namenCache = new Map<string, { name: string; bis: number }>()

async function holeNamen(
  admin: ReturnType<typeof makeAdmin>,
  userIds: string[],
): Promise<Record<string, string>> {
  const jetzt = Date.now()
  const namen: Record<string, string> = {}
  const fehlend: string[] = []

  for (const id of userIds) {
    const treffer = namenCache.get(id)
    if (treffer && treffer.bis > jetzt) namen[id] = treffer.name
    else fehlend.push(id)
  }

  // Parallel statt nacheinander – die Abfragen wissen nichts voneinander
  await Promise.all(fehlend.map(async id => {
    const { data } = await admin.auth.admin.getUserById(id)
    if (!data?.user) return
    const name = displayName(data.user)
    namen[id] = name
    namenCache.set(id, { name, bis: jetzt + NAMEN_HALTBAR_MS })
  }))

  return namen
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

  // Reaktionen auf die Kommentare – erst hier möglich, weil dafür die
  // Kommentar-Kennungen bekannt sein müssen.
  const commentIds = (comments ?? []).map(c => c.id)
  const { data: commentReactions } = commentIds.length
    ? await admin.from('comment_reactions').select('id, comment_id, user_id, emoji').in('comment_id', commentIds)
    : { data: [] }

  // Anzeigenamen der Beteiligten mitliefern, damit der Browser sie nicht
  // einzeln nachladen muss
  const userIds = Array.from(new Set([
    ...(reactions ?? []).map(r => r.user_id),
    ...(comments ?? []).map(c => c.user_id),
    ...(commentReactions ?? []).map(r => r.user_id),
  ]))
  const names = await holeNamen(admin, userIds)

  return NextResponse.json({
    reactions: reactions ?? [],
    comments: comments ?? [],
    commentReactions: commentReactions ?? [],
    names,
    me: user.id,
  })
}

export async function POST(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { photo_id, type, emoji, text, comment_id } = await req.json()
  if (!photo_id) return NextResponse.json({ error: 'photo_id fehlt' }, { status: 400 })

  const admin = makeAdmin()
  const name = displayName(user)

  // ── Reaktion auf einen Kommentar umschalten ───────────────────────────────
  if (type === 'comment_reaction') {
    if (!isReaction(emoji)) {
      return NextResponse.json({ error: 'Unbekannte Reaktion' }, { status: 400 })
    }
    if (typeof comment_id !== 'string' || !comment_id) {
      return NextResponse.json({ error: 'comment_id fehlt' }, { status: 400 })
    }

    const { data: vorhanden } = await admin.from('comment_reactions')
      .select('id').eq('comment_id', comment_id).eq('user_id', user.id).eq('emoji', emoji).maybeSingle()

    if (vorhanden) {
      await admin.from('comment_reactions').delete().eq('id', vorhanden.id)
      return NextResponse.json({ ok: true, aktiv: false })
    }

    const { error } = await admin.from('comment_reactions')
      .insert({ comment_id, user_id: user.id, emoji })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Der Verfasser des Kommentars soll es erfahren – aber nicht, wenn er
    // selbst reagiert hat.
    try {
      const { data: kommentar } = await admin.from('photo_comments')
        .select('user_id, text').eq('id', comment_id).maybeSingle()
      if (kommentar && kommentar.user_id !== user.id) {
        await notifyCommentReaction(user.id, name, emoji, kommentar.text, photo_id, kommentar.user_id)
      }
    } catch (e) {
      console.error('Kommentar-Reaktions-Benachrichtigung fehlgeschlagen:', e)
    }
    return NextResponse.json({ ok: true, aktiv: true })
  }

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

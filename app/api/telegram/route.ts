import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getBotInfo, getRecentChats, sendTelegram, escapeHtml } from '@/lib/telegram'
import { isTopic, TOPIC_KEYS } from '@/lib/notification-topics'

/** Mit Session – für die Authentifizierung des Aufrufers */
function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
}

/**
 * Ohne Session: telegram_bot hat bewusst KEINE RLS-Policy, damit kein Browser
 * an das Token kommt. Nur dieser Client (service_role) darf es lesen.
 */
function makeAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

async function requireUser() {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Liefert den Zustand – das Token selbst wird NIE ausgeliefert. */
export async function GET() {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()
  const [{ data: bot }, { data: chats }] = await Promise.all([
    admin.from('telegram_bot').select('bot_username, updated_at').eq('id', true).maybeSingle(),
    admin.from('telegram_chats').select('*').order('created_at', { ascending: true }),
  ])

  return NextResponse.json({
    connected: !!bot,
    botUsername: bot?.bot_username ?? null,
    updatedAt: bot?.updated_at ?? null,
    chats: chats ?? [],
    topics: TOPIC_KEYS,
  })
}

export async function POST(req: NextRequest) {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const admin = makeAdmin()

  // ── Bot verknüpfen ────────────────────────────────────────────────────────
  if (body.action === 'connect') {
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token) return NextResponse.json({ error: 'Token fehlt' }, { status: 400 })

    // Erst gegen Telegram prüfen, dann speichern – sonst liegt ein totes Token in der DB
    const info = await getBotInfo(token)
    if (!info.ok) return NextResponse.json({ error: `Telegram lehnt das Token ab: ${info.error}` }, { status: 400 })

    const { error } = await admin.from('telegram_bot').upsert({
      id: true, token, bot_username: info.username, updated_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, botUsername: info.username })
  }

  // ── Bot trennen ───────────────────────────────────────────────────────────
  if (body.action === 'disconnect') {
    const { error } = await admin.from('telegram_bot').delete().eq('id', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { data: bot } = await admin.from('telegram_bot').select('token').eq('id', true).maybeSingle()
  if (!bot?.token) return NextResponse.json({ error: 'Kein Bot verknüpft' }, { status: 400 })

  // ── Chats suchen, die dem Bot geschrieben haben ───────────────────────────
  if (body.action === 'discover') {
    const found = await getRecentChats(bot.token)
    if (!found.ok) return NextResponse.json({ error: found.error }, { status: 400 })

    const { data: existing } = await admin.from('telegram_chats').select('chat_id')
    const known = new Set((existing ?? []).map(c => c.chat_id))
    return NextResponse.json({ chats: found.chats.filter(c => !known.has(c.chat_id)) })
  }

  // ── Chat hinzufügen (mit Begrüßung, damit man sofort sieht, dass es geht) ──
  if (body.action === 'add-chat') {
    const chatId = String(body.chat_id ?? '').trim()
    const label = String(body.label ?? '').trim() || chatId
    if (!chatId) return NextResponse.json({ error: 'Chat-ID fehlt' }, { status: 400 })

    const hello = await sendTelegram(
      bot.token, chatId,
      `🐾 <b>Joschi &amp; Bella Tracker</b>\nVerbindung steht, ${escapeHtml(label)}! Hier kommen ab jetzt die Meldungen an.`,
    )
    if (!hello.ok) return NextResponse.json({ error: `Testnachricht fehlgeschlagen: ${hello.error}` }, { status: 400 })

    const { data, error } = await admin.from('telegram_chats')
      .upsert({ chat_id: chatId, label, active: true }, { onConflict: 'chat_id' })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ chat: data })
  }

  // ── Testnachricht an einen bestehenden Chat ───────────────────────────────
  if (body.action === 'test') {
    const chatId = String(body.chat_id ?? '')
    const result = await sendTelegram(bot.token, chatId, '🐾 Test vom Joschi &amp; Bella Tracker – alles angekommen.')
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, active, label, topics } = await req.json()
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof active === 'boolean') patch.active = active
  if (typeof label === 'string' && label.trim()) patch.label = label.trim()
  if (Array.isArray(topics)) patch.topics = topics.filter(isTopic)
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nichts zu ändern' }, { status: 400 })

  const { data, error } = await makeAdmin().from('telegram_chats').update(patch).eq('id', id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Chat nicht gefunden' }, { status: 404 })
  return NextResponse.json({ chat: data[0] })
}

export async function DELETE(req: NextRequest) {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  const { error } = await makeAdmin().from('telegram_chats').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

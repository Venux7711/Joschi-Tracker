import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import webpush from 'web-push'
import { isTopic, TOPIC_KEYS } from '@/lib/notification-topics'

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

async function requireUser() {
  const { data: { user } } = await makeSupabase().auth.getUser()
  return user
}

/**
 * Alle angemeldeten Geräte mit ihren Themen. Der Endpoint wird mitgeliefert,
 * damit der Browser sein eigenes Gerät erkennt – er ist kein Geheimnis, ohne
 * die zugehörigen Schlüssel lässt sich damit nichts verschicken.
 */
export async function GET() {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()
  const [{ data, error }, { data: sent }] = await Promise.all([
    admin.from('push_subscriptions')
      .select('id, endpoint, topics, label, created_at')
      .order('created_at', { ascending: true }),
    admin.from('notifications_sent').select('recipient, sent_at').eq('channel', 'push'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Wann wurde dieses Gerät zuletzt tatsächlich beliefert? Ohne das sieht man
  // in der Liste nicht, welcher von mehreren Einträgen noch lebt.
  const lastByEndpoint = new Map<string, string>()
  for (const row of sent ?? []) {
    const prev = lastByEndpoint.get(row.recipient)
    if (!prev || row.sent_at > prev) lastByEndpoint.set(row.recipient, row.sent_at)
  }

  const devices = (data ?? []).map(d => ({ ...d, last_sent_at: lastByEndpoint.get(d.endpoint) ?? null }))
  return NextResponse.json({ devices, topics: TOPIC_KEYS })
}

export async function PATCH(req: NextRequest) {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, topics, label } = await req.json()
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (Array.isArray(topics)) patch.topics = topics.filter(isTopic)
  if (typeof label === 'string') patch.label = label.trim() || null
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nichts zu ändern' }, { status: 400 })

  const { data, error } = await makeAdmin().from('push_subscriptions').update(patch).eq('id', id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Gerät nicht gefunden' }, { status: 404 })
  return NextResponse.json({ device: data[0] })
}

/** Testmeldung an ein Gerät – damit man sieht, dass es wirklich ankommt. */
export async function POST(req: NextRequest) {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  if (!process.env.VAPID_EMAIL || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Push ist auf dem Server nicht konfiguriert' }, { status: 500 })
  }

  const admin = makeAdmin()
  const { data: sub } = await admin.from('push_subscriptions').select('*').eq('id', id).maybeSingle()
  if (!sub) return NextResponse.json({ error: 'Gerät nicht gefunden' }, { status: 404 })

  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY,
  )

  try {
    await webpush.sendNotification(
      sub.subscription as webpush.PushSubscription,
      JSON.stringify({ title: '🐾 Test', body: 'Benachrichtigungen kommen an.', url: '/dashboard' }),
      // Wie im echten Versand – sonst prüft der Test etwas anderes als den Alltag
      { urgency: 'high', TTL: 3600 },
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode
    // Abgelaufene Abos aufräumen, damit sie nicht ewig als Empfänger geführt werden
    if (status === 404 || status === 410) {
      await admin.from('push_subscriptions').delete().eq('id', id)
      return NextResponse.json({ error: 'Abo ist abgelaufen und wurde entfernt. Bitte erneut aktivieren.' }, { status: 400 })
    }
    return NextResponse.json({ error: `Versand fehlgeschlagen (${status ?? 'Fehler'})` }, { status: 400 })
  }
}

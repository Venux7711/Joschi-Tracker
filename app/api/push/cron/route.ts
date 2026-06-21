import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function GET(req: NextRequest) {
  // Vercel Cron sets this header automatically
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isLocalDev = process.env.NODE_ENV !== 'production'
  if (!isVercelCron && !isLocalDev) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  // Get all cats
  const { data: cats } = await supabase.from('cats').select('id, name').limit(1)
  const cat = cats?.[0]
  if (!cat) return NextResponse.json({ ok: true, sent: 0 })

  // Yesterday's health data
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dayStr = yesterday.toISOString().slice(0, 10)

  const { data: healthLogs } = await supabase
    .from('health_logs')
    .select('stool_consistency, appetite')
    .eq('cat_id', cat.id)
    .gte('logged_at', `${dayStr}T00:00:00`)
    .lte('logged_at', `${dayStr}T23:59:59`)

  const { data: feedLogs } = await supabase
    .from('feeding_logs')
    .select('food_type')
    .eq('cat_id', cat.id)
    .gte('logged_at', `${dayStr}T00:00:00`)
    .lte('logged_at', `${dayStr}T23:59:59`)

  const stool = healthLogs?.[0]?.stool_consistency
  let statusEmoji = '✅'
  let statusText = 'Alles normal gestern'
  if (stool === 'diarrhea') { statusEmoji = '⚠️'; statusText = 'Durchfall gestern – heute im Blick behalten' }
  else if (stool === 'soft') { statusEmoji = '🟡'; statusText = 'Weicher Stuhl gestern' }
  else if (!stool) { statusText = 'Kein Befinden eingetragen' }

  const lastFood = feedLogs?.at(-1)?.food_type ?? 'Unbekannt'

  const payload = JSON.stringify({
    title: `Joschi – Guten Morgen! ${statusEmoji}`,
    body: `${statusText}\nLetztes Futter: ${lastFood}`,
    url: '/dashboard',
  })

  // Get all subscriptions
  const { data: subs } = await supabase.from('push_subscriptions').select('subscription')
  let sent = 0

  for (const row of subs ?? []) {
    try {
      await webpush.sendNotification(row.subscription as webpush.PushSubscription, payload)
      sent++
    } catch {
      // Subscription expired or invalid – remove it
      await supabase.from('push_subscriptions').delete().eq('subscription', row.subscription)
    }
  }

  return NextResponse.json({ ok: true, sent })
}

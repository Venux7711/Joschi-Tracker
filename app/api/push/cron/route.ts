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

  // Alle Katzen des Haushalts – ein Cron-Lauf betrifft nicht nur "eine aktive" Katze
  const { data: cats } = await supabase.from('cats').select('id, name').order('created_at', { ascending: true })
  if (!cats?.length) return NextResponse.json({ ok: true, sent: 0 })

  // Yesterday's health data
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dayStr = yesterday.toISOString().slice(0, 10)

  const catSummaries = await Promise.all(cats.map(async (cat) => {
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
    let statusText = 'alles normal'
    if (stool === 'diarrhea') { statusEmoji = '⚠️'; statusText = 'Durchfall – im Blick behalten' }
    else if (stool === 'soft') { statusEmoji = '🟡'; statusText = 'weicher Stuhl' }
    else if (!stool) { statusText = 'kein Befinden eingetragen' }

    const lastFood = feedLogs?.at(-1)?.food_type ?? 'unbekannt'
    return { name: cat.name, statusEmoji, line: `${cat.name}: ${statusText} · Futter: ${lastFood}` }
  }))

  const overallEmoji = catSummaries.some((c) => c.statusEmoji === '⚠️') ? '⚠️' : catSummaries.every((c) => c.statusEmoji === '✅') ? '✅' : '🟡'

  const payload = JSON.stringify({
    title: `Guten Morgen! ${overallEmoji}`,
    body: catSummaries.map((c) => c.line).join('\n'),
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

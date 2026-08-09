import { createServerClient } from '@supabase/ssr'
import webpush from 'web-push'
import { sendTelegram, escapeHtml } from './telegram'
import { dedupeSharedFeedings } from './utils'
import { addBerlinDays, berlinDateKey, berlinDayStart, berlinDayEnd, berlinHour, berlinDaysBetween, formatBerlin } from './time'
import { birthdayInfo } from './birthday'
import type { Cat, FeedingLog, HealthLog, PantryItem } from './types'
import { type NotificationTopic } from './notification-topics'

export { NOTIFICATION_TOPICS, TOPIC_KEYS, isTopic } from './notification-topics'

export type Message = { title: string; body: string }

function makeAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

const STOOL: Record<string, string> = {
  normal: 'normal', soft: 'weich', diarrhea: '⚠️ Durchfall', not_observed: 'nicht gesehen',
}

/**
 * Stellt zusammen, was gerade fällig ist. Was dran ist, entscheidet die
 * Berliner Uhrzeit – die Cron-Läufe rufen dieselbe Funktion morgens und abends.
 */
export async function buildDueMessages(now: Date = new Date()): Promise<Partial<Record<NotificationTopic, Message>>> {
  const admin = makeAdmin()
  const hour = berlinHour(now)
  const today = berlinDateKey(now)
  const yesterday = addBerlinDays(now, -1)

  const { data: catRows } = await admin.from('cats').select('*').order('created_at', { ascending: true })
  const cats = (catRows ?? []) as Cat[]
  if (cats.length === 0) return {}
  const catIds = cats.map(c => c.id)
  const householdNames = cats.map(c => c.name).join(' & ')

  const [{ data: todayFeedRaw }, { data: yFeedRaw }, { data: healthRaw }, { data: pantryRaw }] = await Promise.all([
    admin.from('feeding_logs').select('*').in('cat_id', catIds)
      .gte('logged_at', berlinDayStart(now).toISOString()).lte('logged_at', berlinDayEnd(now).toISOString()),
    admin.from('feeding_logs').select('*').in('cat_id', catIds)
      .gte('logged_at', berlinDayStart(yesterday).toISOString()).lte('logged_at', berlinDayEnd(yesterday).toISOString()),
    admin.from('health_logs').select('*').in('cat_id', catIds)
      .gte('logged_at', addBerlinDays(now, -14).toISOString()).order('logged_at', { ascending: false }),
    admin.from('pantry_items').select('*').in('cat_id', catIds).gt('quantity', 0),
  ])

  const todayFeed = dedupeSharedFeedings((todayFeedRaw ?? []) as FeedingLog[])
  const yFeed = dedupeSharedFeedings((yFeedRaw ?? []) as FeedingLog[])
  const health = (healthRaw ?? []) as HealthLog[]
  const pantry = (pantryRaw ?? []) as PantryItem[]

  const isMorning = hour >= 5 && hour < 13
  const isEvening = hour >= 17
  const messages: Partial<Record<NotificationTopic, Message>> = {}

  if (isEvening && todayFeed.length === 0) {
    messages.reminder = {
      title: '🍽️ Noch kein Futter für heute',
      body: `Für ${householdNames} ist heute nichts eingetragen. Im Dashboard reicht ein Tipp auf die Sorte.`,
    }
  }

  const lastHealth = health[0]
  const daysSinceHealth = lastHealth ? berlinDaysBetween(lastHealth.logged_at, now) : null
  if (isEvening && (daysSinceHealth === null || daysSinceHealth >= 3)) {
    messages.health = {
      title: '🩺 Wie geht es den beiden?',
      body: daysSinceHealth === null
        ? `Seit mindestens zwei Wochen kein Befinden erfasst.`
        : `Seit ${daysSinceHealth} Tagen kein Befinden erfasst. Ein Tipp im Dashboard genügt.`,
    }
  }

  if (isMorning) {
    const foods = Array.from(new Set(yFeed.map(f => f.food_type || f.food_brand)))
    const yKey = berlinDateKey(yesterday)
    // Befinden ist individuell – deshalb pro Katze auflisten, so wie es die
    // frühere Morgenmeldung schon tat
    const perCat = cats.map(c => {
      const stool = health.find(h => h.cat_id === c.id && berlinDateKey(h.logged_at) === yKey)?.stool_consistency
      return `${c.name}: ${stool ? STOOL[stool] ?? stool : 'kein Befinden eingetragen'}`
    })
    messages.morning = {
      title: '☀️ Guten Morgen!',
      body: [
        `Gestern, ${formatBerlin(yesterday, { weekday: 'long', day: 'numeric', month: 'long' })}:`,
        foods.length ? `🍽️ ${foods.join(', ')}` : '🍽️ kein Futter eingetragen',
        ...perCat.map(l => `🩺 ${l}`),
      ].join('\n'),
    }
  }

  const totalCans = pantry.reduce((s, p) => s + p.quantity, 0)
  if (isMorning && totalCans > 0 && totalCans <= 4) {
    messages.pantry = {
      title: '🥫 Vorrat wird knapp',
      body: `Nur noch ${totalCans} ${totalCans === 1 ? 'Dose' : 'Dosen'} im Haus:\n` +
        pantry.map(p => `• ${p.type || p.brand}: ${p.quantity}`).join('\n'),
    }
  }

  const diarrheaDays = new Set(
    health.filter(h => h.stool_consistency === 'diarrhea').map(h => berlinDateKey(h.logged_at)),
  )
  if (diarrheaDays.has(today) && diarrheaDays.has(berlinDateKey(yesterday))) {
    const recentFoods = Array.from(new Set([...yFeed, ...todayFeed].map(f => f.food_type || f.food_brand)))
    messages.diarrhea = {
      title: '⚠️ Zwei Tage Durchfall in Folge',
      body: `Zuletzt gefüttert: ${recentFoods.join(', ') || 'nichts erfasst'}. Bitte im Blick behalten.`,
    }
  }

  if (isMorning) {
    const bd = cats.map(c => ({ c, i: birthdayInfo(c.birthday, now) })).find(x => x.i?.isToday)
    if (bd) {
      messages.birthday = {
        title: `🎂 ${bd.c.name} wird heute ${bd.i!.age}!`,
        body: 'Zeit für ein Geburtstagsfoto – das Dashboard hat einen Knopf dafür.',
      }
    }
  }

  return messages
}

/**
 * Reserviert eine Meldung für Empfänger/Thema/Tag. Gibt false zurück, wenn sie
 * heute schon rausging – so bleibt es bei einer Meldung pro Tag, egal wie oft
 * ein Cron läuft.
 */
async function claim(
  admin: ReturnType<typeof makeAdmin>,
  channel: string, recipient: string, topic: string, day: string,
): Promise<boolean> {
  const { error } = await admin.from('notifications_sent').insert({ channel, recipient, topic, day })
  return !error
}

async function release(
  admin: ReturnType<typeof makeAdmin>,
  channel: string, recipient: string, topic: string, day: string,
): Promise<void> {
  await admin.from('notifications_sent').delete()
    .eq('channel', channel).eq('recipient', recipient).eq('topic', topic).eq('day', day)
}

export type RunResult = {
  ok: true
  hour: number
  prepared: string[]
  push: { sent: string[]; failed: string[] }
  telegram: { sent: string[]; failed: string[]; skipped?: string }
}

/** Verschickt alle fälligen Meldungen über beide Kanäle. */
export async function runNotifications(now: Date = new Date()): Promise<RunResult> {
  const admin = makeAdmin()
  const messages = await buildDueMessages(now)
  const today = berlinDateKey(now)
  const entries = Object.entries(messages) as [NotificationTopic, Message][]

  const push = { sent: [] as string[], failed: [] as string[] }
  const telegram = { sent: [] as string[], failed: [] as string[], skipped: undefined as string | undefined }

  // ── Push ──────────────────────────────────────────────────────────────────
  if (entries.length > 0 && process.env.VAPID_EMAIL && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY,
    )

    const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, subscription, topics, label')
    for (const sub of subs ?? []) {
      for (const [topic, msg] of entries) {
        if (!(sub.topics ?? []).includes(topic)) continue
        if (!await claim(admin, 'push', sub.endpoint, topic, today)) continue

        try {
          await webpush.sendNotification(
            sub.subscription as webpush.PushSubscription,
            JSON.stringify({ title: msg.title, body: msg.body, url: '/dashboard' }),
          )
          push.sent.push(`${sub.label ?? 'Gerät'}/${topic}`)
        } catch (e) {
          const status = (e as { statusCode?: number })?.statusCode
          push.failed.push(`${sub.label ?? 'Gerät'}/${topic}: ${status ?? 'Fehler'}`)
          await release(admin, 'push', sub.endpoint, topic, today)
          // Nur bei abgelaufenem Abo aufräumen – ein Netzwerkfehler darf das
          // Abo nicht kosten, sonst verschwinden Empfänger stillschweigend
          if (status === 404 || status === 410) {
            await admin.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      }
    }
  }

  // ── Telegram (optional, nur wenn ein Bot verknüpft ist) ───────────────────
  const { data: bot } = await admin.from('telegram_bot').select('token').eq('id', true).maybeSingle()
  if (!bot?.token) {
    telegram.skipped = 'kein Bot verknüpft'
  } else if (entries.length > 0) {
    const { data: chats } = await admin.from('telegram_chats').select('*').eq('active', true)
    for (const chat of chats ?? []) {
      for (const [topic, msg] of entries) {
        if (!(chat.topics ?? []).includes(topic)) continue
        if (!await claim(admin, 'telegram', chat.chat_id, topic, today)) continue

        const text = `<b>${escapeHtml(msg.title)}</b>\n${escapeHtml(msg.body)}`
        const result = await sendTelegram(bot.token, chat.chat_id, text)
        if (result.ok) {
          telegram.sent.push(`${chat.label}/${topic}`)
          await admin.from('telegram_chats').update({ last_sent_at: new Date().toISOString() }).eq('id', chat.id)
        } else {
          telegram.failed.push(`${chat.label}/${topic}: ${result.error}`)
          await release(admin, 'telegram', chat.chat_id, topic, today)
        }
      }
    }
  }

  return { ok: true, hour: berlinHour(now), prepared: entries.map(([t]) => t), push, telegram }
}

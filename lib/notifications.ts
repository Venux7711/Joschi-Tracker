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

/**
 * Versand-Optionen für Apple & Co.
 *
 * urgency 'high': Ohne das schickt web-push "normal", und APNs darf solche
 * Meldungen bündeln oder verzögern – auf dem iPhone kommen sie dann
 * unregelmäßig oder gar nicht an. Diese Meldungen sind alle für den Nutzer
 * bestimmt, also gehören sie in die hohe Stufe.
 *
 * TTL: Wie lange Apple eine Meldung aufhebt, falls das Gerät offline ist.
 * Zeitgebundenes soll nicht Stunden später aufploppen – ein "Guten Morgen"
 * um 20 Uhr ist nur noch Lärm. Ereignisse dürfen länger warten.
 */
const TTL_BY_TOPIC: Partial<Record<NotificationTopic, number>> = {
  morning: 6 * 3600,
  reminder: 6 * 3600,
  health: 6 * 3600,
  pantry: 12 * 3600,
  photo: 24 * 3600,
  diarrhea: 24 * 3600,
  birthday: 20 * 3600,
}

function sendOptions(topic: NotificationTopic): { urgency: 'high'; TTL: number } {
  return { urgency: 'high', TTL: TTL_BY_TOPIC[topic] ?? 6 * 3600 }
}

/**
 * Ab wie vielen Fehlschlägen in Folge ein Abo entfernt wird.
 *
 * Vorher flog es schon beim ersten 410 raus. Apple meldet das aber auch
 * vorübergehend, während das Gerät seine Anmeldung weiter für gültig hält –
 * der Nutzer musste dann grundlos neu aktivieren.
 */
const MAX_FAILURES = 3

async function notePushSuccess(admin: ReturnType<typeof makeAdmin>, id: string) {
  await admin.from('push_subscriptions')
    .update({ fail_count: 0, last_success_at: new Date().toISOString() })
    .eq('id', id)
}

/** Zählt den Fehlschlag und entfernt das Abo erst, wenn es dauerhaft tot ist. */
async function notePushFailure(
  admin: ReturnType<typeof makeAdmin>,
  sub: { id: string; fail_count?: number | null },
  status?: number,
): Promise<'geloescht' | 'gezaehlt' | 'ignoriert'> {
  // Nur "weg" heißt weg. Netzwerk- und Serverfehler zählen nicht mit.
  if (status !== 404 && status !== 410) return 'ignoriert'

  const next = (sub.fail_count ?? 0) + 1
  if (next >= MAX_FAILURES) {
    await admin.from('push_subscriptions').delete().eq('id', sub.id)
    return 'geloescht'
  }
  await admin.from('push_subscriptions').update({ fail_count: next }).eq('id', sub.id)
  return 'gezaehlt'
}

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

  // Nicht mehr ans Eintragen erinnern, wenn länger nichts kam: Kein Eintrag
  // heißt hier "alles gut". Stattdessen nachhaken, wenn der letzte Eintrag
  // eine Auffälligkeit war und seitdem nichts nachgetragen wurde – dann ist
  // offen, ob es sich gebessert hat.
  const lastHealth = health[0]
  const letzteWarAuffaellig = lastHealth
    && (lastHealth.stool_consistency === 'diarrhea'
      || lastHealth.stool_consistency === 'soft'
      || lastHealth.vomiting
      || lastHealth.fur_issue)
  const tageSeitdem = lastHealth ? berlinDaysBetween(lastHealth.logged_at, now) : null

  if (isEvening && letzteWarAuffaellig && tageSeitdem !== null && tageSeitdem >= 2 && tageSeitdem <= 7) {
    const was = lastHealth!.stool_consistency === 'diarrhea' ? 'Durchfall'
      : lastHealth!.stool_consistency === 'soft' ? 'weicher Stuhl'
      : lastHealth!.vomiting ? 'Erbrechen' : 'Kot im Fell'
    messages.health = {
      title: '🩺 Hat sich das gebessert?',
      body: `Vor ${tageSeitdem} Tagen war ${was} eingetragen, seitdem nichts mehr. Falls es weiter auffällig ist, kurz vermerken.`,
    }
  }

  if (isMorning) {
    const foods = Array.from(new Set(yFeed.map(f => f.food_type || f.food_brand)))
    const yKey = berlinDateKey(yesterday)
    // Befinden ist individuell – deshalb pro Katze auflisten, so wie es die
    // frühere Morgenmeldung schon tat
    // Kein Eintrag heißt "alles in Ordnung" – im Haushalt wird das Befinden
    // nur bei Auffälligkeiten erfasst. "Kein Befinden eingetragen" zu melden
    // war schlicht falsch herum.
    const perCat = cats.map(c => {
      const h = health.find(x => x.cat_id === c.id && berlinDateKey(x.logged_at) === yKey)
      if (!h) return `${c.name}: unauffällig`
      const teile = [
        STOOL[h.stool_consistency] ?? h.stool_consistency,
        h.vomiting ? 'erbrochen' : null,
        h.fur_issue ? 'Kot im Fell' : null,
      ].filter(Boolean)
      return `${c.name}: ${teile.join(', ')}`
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

    const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, subscription, topics, label, fail_count')
    for (const sub of subs ?? []) {
      for (const [topic, msg] of entries) {
        if (!(sub.topics ?? []).includes(topic)) continue
        if (!await claim(admin, 'push', sub.endpoint, topic, today)) continue

        try {
          await webpush.sendNotification(
            sub.subscription as webpush.PushSubscription,
            JSON.stringify({ title: msg.title, body: msg.body, url: '/dashboard' }),
            sendOptions(topic),
          )
          push.sent.push(`${sub.label ?? 'Gerät'}/${topic}`)
          await notePushSuccess(admin, sub.id)
        } catch (e) {
          const status = (e as { statusCode?: number })?.statusCode
          await release(admin, 'push', sub.endpoint, topic, today)
          const folge = await notePushFailure(admin, sub, status)
          push.failed.push(`${sub.label ?? 'Gerät'}/${topic}: ${status ?? 'Fehler'} (${folge})`)
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

/**
 * Meldung über ein neues Foto.
 *
 * Anders als die übrigen Themen hängt diese nicht am Cron, sondern wird beim
 * Hochladen ausgelöst. Zwei Eigenheiten:
 *
 * - Wer das Foto hochlädt, bekommt keine Meldung darüber. Eine Benachrichtigung
 *   über das eigene, gerade geschossene Foto wäre nur Lärm.
 * - Kurze Sperrfrist statt der sonst üblichen Tagesgrenze: Wer zehn Bilder auf
 *   einmal hochlädt, soll nicht zehn Meldungen auslösen – eine Meldung pro Tag
 *   wäre umgekehrt zu wenig für ein Ereignis.
 */
const PHOTO_COOLDOWN_MINUTES = 10

/**
 * Ereignis-Meldung an alle außer den Auslöser.
 *
 * Anders als die Cron-Themen hängt sie an einer Handlung, nicht an der
 * Uhrzeit. Statt der Tagesgrenze gilt eine kurze Sperrfrist: Wer zehn Bilder
 * am Stück hochlädt, soll nicht zehn Meldungen auslösen – eine pro Tag wäre
 * für ein Ereignis aber zu wenig.
 *
 * Wer die Handlung ausgelöst hat, bekommt nichts: eine Meldung über die
 * eigene Reaktion wäre nur Lärm.
 */
async function notifyEvent(opts: {
  topic: NotificationTopic
  actorUserId: string | null
  title: string
  body: string
  url: string
  cooldownMinutes: number
}): Promise<{ sent: number }> {
  const admin = makeAdmin()
  const now = new Date()
  const today = berlinDateKey(now)
  const cutoff = new Date(now.getTime() - opts.cooldownMinutes * 60_000).toISOString()

  if (!process.env.VAPID_EMAIL || !process.env.VAPID_PRIVATE_KEY) return { sent: 0 }
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY,
  )

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, subscription, topics, user_id, fail_count')
  let sent = 0

  for (const sub of subs ?? []) {
    if (!(sub.topics ?? []).includes(opts.topic)) continue
    if (opts.actorUserId && sub.user_id === opts.actorUserId) continue

    const { data: last } = await admin
      .from('notifications_sent')
      .select('sent_at')
      .eq('channel', 'push').eq('recipient', sub.endpoint).eq('topic', opts.topic)
      .order('sent_at', { ascending: false }).limit(1)
    if (last?.[0] && last[0].sent_at > cutoff) continue

    try {
      await webpush.sendNotification(
        sub.subscription as webpush.PushSubscription,
        JSON.stringify({ title: opts.title, body: opts.body, url: opts.url }),
        sendOptions(opts.topic),
      )
      sent++
      await notePushSuccess(admin, sub.id)
      await admin.from('notifications_sent').upsert(
        { channel: 'push', recipient: sub.endpoint, topic: opts.topic, day: today, sent_at: new Date().toISOString() },
        { onConflict: 'channel,recipient,topic,day' },
      )
    } catch (e) {
      await notePushFailure(admin, sub, (e as { statusCode?: number })?.statusCode)
    }
  }

  return { sent }
}

/** Neues Foto im Album. */
export function notifyNewPhoto(uploaderUserId: string | null, photoId?: string) {
  return notifyEvent({
    topic: 'photo',
    actorUserId: uploaderUserId,
    title: '📸 Neues Foto',
    body: 'Es gibt ein neues Bild im Album.',
    url: photoId ? `/fotos?photo=${photoId}` : '/fotos',
    cooldownMinutes: 10,
  })
}

/**
 * Reaktion auf ein Foto. Absender und Emoji stehen in der Meldung, der Link
 * führt direkt auf das Bild – sonst wüsste man nicht, worauf sich das bezieht.
 */
export function notifyReaction(actorUserId: string, actorName: string, emoji: string, photoId: string) {
  return notifyEvent({
    topic: 'reaction',
    actorUserId,
    title: `${emoji} ${actorName}`,
    body: `${actorName} hat auf ein Foto reagiert.`,
    url: `/fotos?photo=${photoId}`,
    // Kurz, damit mehrere Reaktionen kurz nacheinander nicht mehrfach melden
    cooldownMinutes: 3,
  })
}

/** Kommentar zu einem Foto – der Text steht gekürzt in der Meldung. */
export function notifyComment(actorUserId: string, actorName: string, text: string, photoId: string) {
  const kurz = text.length > 120 ? `${text.slice(0, 119)}…` : text
  return notifyEvent({
    topic: 'comment',
    actorUserId,
    title: `💬 ${actorName}`,
    body: kurz,
    url: `/fotos?photo=${photoId}`,
    cooldownMinutes: 0,
  })
}

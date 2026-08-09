import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { sendTelegram, escapeHtml, type TelegramTopic } from '@/lib/telegram'
import { dedupeSharedFeedings } from '@/lib/utils'
import { addBerlinDays, berlinDateKey, berlinDayStart, berlinDayEnd, berlinHour, berlinDaysBetween, formatBerlin } from '@/lib/time'
import { birthdayInfo } from '@/lib/birthday'
import type { Cat, FeedingLog, HealthLog, PantryItem } from '@/lib/types'

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
 * Stellt die fälligen Meldungen zusammen und verschickt sie.
 *
 * Läuft mehrmals täglich (siehe vercel.json). Welche Meldung wann dran ist,
 * entscheidet die Berliner Uhrzeit; telegram_sent verhindert Doppelungen.
 */
export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isLocalDev = process.env.NODE_ENV !== 'production'
  const manual = req.nextUrl.searchParams.get('topic')
  if (!isVercelCron && !isLocalDev && !manual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = makeAdmin()
  const { data: bot } = await admin.from('telegram_bot').select('token').eq('id', true).maybeSingle()
  if (!bot?.token) return NextResponse.json({ ok: true, skipped: 'kein Bot verknüpft' })

  const { data: chatRows } = await admin.from('telegram_chats').select('*').eq('active', true)
  const chats = chatRows ?? []
  if (chats.length === 0) return NextResponse.json({ ok: true, skipped: 'keine aktiven Chats' })

  const now = new Date()
  const hour = berlinHour(now)
  const today = berlinDateKey(now)
  const yesterday = addBerlinDays(now, -1)

  const { data: catRows } = await admin.from('cats').select('*').order('created_at', { ascending: true })
  const cats = (catRows ?? []) as Cat[]
  const catIds = cats.map(c => c.id)
  const householdNames = cats.map(c => c.name).join(' & ')

  const [{ data: todayFeedRaw }, { data: yFeedRaw }, { data: recentHealthRaw }, { data: pantryRaw }] = await Promise.all([
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
  const health = (recentHealthRaw ?? []) as HealthLog[]
  const pantry = (pantryRaw ?? []) as PantryItem[]

  /** topic → Nachricht, oder null wenn gerade nichts zu melden ist */
  const messages: Partial<Record<TelegramTopic, string>> = {}

  // ── Abend-Erinnerung: nur bei echter Lücke ────────────────────────────────
  if (hour >= 19 && todayFeed.length === 0) {
    messages.reminder =
      `🍽️ <b>Noch kein Futter für heute</b>\nFür ${escapeHtml(householdNames)} ist heute nichts eingetragen.\n\nIm Dashboard reicht ein Tipp auf die Sorte.`
  }

  // ── Befinden-Erinnerung: die eigentliche Lücke ────────────────────────────
  const lastHealth = health[0]
  const daysSinceHealth = lastHealth ? berlinDaysBetween(lastHealth.logged_at, now) : null
  if (hour >= 19 && (daysSinceHealth === null || daysSinceHealth >= 3)) {
    messages.health = daysSinceHealth === null
      ? `🩺 <b>Befinden</b>\nSeit mindestens zwei Wochen kein Eintrag. Wie geht es ${escapeHtml(householdNames)}?`
      : `🩺 <b>Befinden</b>\nSeit ${daysSinceHealth} Tagen kein Eintrag. Ein Tipp im Dashboard genügt.`
  }

  // ── Morgenmeldung ─────────────────────────────────────────────────────────
  if (hour >= 7 && hour < 12) {
    const foods = Array.from(new Set(yFeed.map(f => f.food_type || f.food_brand)))
    const yHealth = health.filter(h => berlinDateKey(h.logged_at) === berlinDateKey(yesterday))
    const stool = yHealth[0]?.stool_consistency
    const lines = [
      `☀️ <b>Guten Morgen!</b>`,
      `Gestern, ${formatBerlin(yesterday, { weekday: 'long', day: 'numeric', month: 'long' })}:`,
      foods.length ? `🍽️ ${escapeHtml(foods.join(', '))}` : `🍽️ kein Futter eingetragen`,
      stool ? `🩺 Stuhlgang: ${STOOL[stool] ?? stool}` : `🩺 kein Befinden eingetragen`,
    ]
    messages.morning = lines.join('\n')
  }

  // ── Vorrat wird knapp ─────────────────────────────────────────────────────
  const totalCans = pantry.reduce((s, p) => s + p.quantity, 0)
  if (hour >= 7 && hour < 12 && totalCans > 0 && totalCans <= 4) {
    const list = pantry.map(p => `• ${escapeHtml(p.type || p.brand)}: ${p.quantity}`).join('\n')
    messages.pantry = `🥫 <b>Vorrat wird knapp</b>\nNur noch ${totalCans} ${totalCans === 1 ? 'Dose' : 'Dosen'} im Haus:\n${list}`
  }

  // ── Durchfall an zwei Tagen in Folge ──────────────────────────────────────
  const diarrheaDays = new Set(
    health.filter(h => h.stool_consistency === 'diarrhea').map(h => berlinDateKey(h.logged_at)),
  )
  if (diarrheaDays.has(today) && diarrheaDays.has(berlinDateKey(yesterday))) {
    const recentFoods = Array.from(new Set([...yFeed, ...todayFeed].map(f => f.food_type || f.food_brand)))
    messages.diarrhea =
      `⚠️ <b>Zwei Tage Durchfall in Folge</b>\nGefüttert wurde zuletzt: ${escapeHtml(recentFoods.join(', ') || 'nichts erfasst')}.\n\nBitte im Blick behalten.`
  }

  // ── Geburtstag ────────────────────────────────────────────────────────────
  if (hour >= 7 && hour < 12) {
    const bd = cats.map(c => ({ c, i: birthdayInfo(c.birthday, now) })).find(x => x.i?.isToday)
    if (bd) {
      messages.birthday = `🎂 <b>${escapeHtml(bd.c.name)} wird heute ${bd.i!.age}!</b>\nZeit für ein Geburtstagsfoto – das Dashboard hat einen Knopf dafür.`
    }
  }

  // ── Versenden ─────────────────────────────────────────────────────────────
  const sent: string[] = []
  const failed: string[] = []

  for (const chat of chats) {
    for (const [topic, text] of Object.entries(messages) as [TelegramTopic, string][]) {
      if (manual && manual !== topic) continue
      if (!(chat.topics ?? []).includes(topic)) continue

      // Pro Chat, Thema und Tag nur einmal – der Cron läuft mehrmals
      const { error: claimError } = await admin
        .from('telegram_sent')
        .insert({ chat_id: chat.chat_id, topic, day: today })
      if (claimError) continue // schon verschickt

      const result = await sendTelegram(bot.token, chat.chat_id, text)
      if (result.ok) {
        sent.push(`${chat.label}/${topic}`)
        await admin.from('telegram_chats').update({ last_sent_at: new Date().toISOString() }).eq('id', chat.id)
      } else {
        failed.push(`${chat.label}/${topic}: ${result.error}`)
        // Fehlgeschlagenes wieder freigeben, damit der nächste Lauf es erneut versucht
        await admin.from('telegram_sent').delete()
          .eq('chat_id', chat.chat_id).eq('topic', topic).eq('day', today)
      }
    }
  }

  return NextResponse.json({ ok: true, hour, prepared: Object.keys(messages), sent, failed })
}

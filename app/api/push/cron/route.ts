import { NextRequest, NextResponse } from 'next/server'
import { runNotifications } from '@/lib/notifications'
import { isAuthorizedCron } from '@/lib/cron-auth'

/**
 * Morgen-Slot: Zusammenfassung von gestern, Vorratswarnung, Geburtstagsgruß.
 *
 * Früher baute diese Route ihre eigene Morgenmeldung. Inzwischen entscheidet
 * lib/notifications.ts anhand der Berliner Uhrzeit, was fällig ist, und
 * verschickt es über Push und – falls verknüpft – Telegram. Die Route ist nur
 * noch der Auslöser. Der Abend-Slot liegt auf /api/telegram/cron; zwei Slots,
 * weil der Vercel-Hobby-Tarif pro Cron-Job nur einen Lauf am Tag zulässt.
 */
export async function GET(req: NextRequest) {
  if (!await isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(await runNotifications())
}

import { NextRequest, NextResponse } from 'next/server'
import { runNotifications } from '@/lib/notifications'
import { isAuthorizedCron } from '@/lib/cron-auth'

/**
 * Abend-Slot: Erinnerungen, wenn für heute nichts erfasst wurde.
 *
 * Der Pfad heißt aus historischen Gründen "telegram", verschickt aber über
 * alle Kanäle – Push und, falls verknüpft, Telegram. Zwei Slots statt eines
 * mehrfach laufenden Jobs, weil der Vercel-Hobby-Tarif pro Cron-Job nur einen
 * Lauf am Tag zulässt. Der Morgen-Slot hängt an /api/push/cron.
 */
export async function GET(req: NextRequest) {
  if (!await isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(await runNotifications())
}

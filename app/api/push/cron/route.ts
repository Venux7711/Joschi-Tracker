import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { runNotifications } from '@/lib/notifications'

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
  // Von der Middleware ausgenommen, damit Vercels Aufruf ankommt – also hier
  // selbst autorisieren.
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isLocalDev = process.env.NODE_ENV !== 'production'

  if (!isVercelCron && !isLocalDev) {
    const sessionClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => cookies().getAll(), setAll: () => {} } }
    )
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(await runNotifications())
}

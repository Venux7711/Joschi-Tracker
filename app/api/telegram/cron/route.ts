import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { runTelegramCron } from '@/lib/telegram-cron'

/**
 * Abend-Lauf: Erinnerungen, wenn für heute nichts erfasst wurde.
 *
 * Der Vercel-Hobby-Tarif erlaubt pro Cron-Job nur einen Lauf am Tag, deshalb
 * gibt es zwei Pfade statt eines Jobs mit zwei Zeiten. Was tatsächlich
 * verschickt wird, entscheidet die Berliner Uhrzeit in runTelegramCron().
 */
export async function GET(req: NextRequest) {
  // Die Route ist von der Middleware ausgenommen (sonst käme Vercels Aufruf gar
  // nicht an), also hier selbst autorisieren.
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

  return NextResponse.json(await runTelegramCron())
}

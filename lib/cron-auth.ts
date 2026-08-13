import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Darf dieser Aufruf den Versand auslösen?
 *
 * Die Cron-Routen sind von der Middleware ausgenommen (sonst käme ein Aufruf
 * von außen gar nicht an), müssen sich also selbst schützen. Erlaubt sind:
 *
 * - GitHub Actions mit dem gemeinsamen Secret. Das ist der eigentliche
 *   Zeitgeber: Vercel löst auf dem Hobby-Tarif nicht zuverlässig aus – die
 *   Jobs waren registriert und aktiv, liefen aber tagelang nicht.
 * - Vercels eigener Cron, falls er doch einmal auslöst.
 * - Ein angemeldeter Nutzer, der von Hand auslöst.
 */
export async function isAuthorizedCron(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = req.headers.get('authorization') ?? ''
    if (header === `Bearer ${secret}`) return true
  }

  if (req.headers.get('x-vercel-cron') === '1') return true
  if (process.env.NODE_ENV !== 'production') return true

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookies().getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return !!user
}

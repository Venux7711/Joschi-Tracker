import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
}

/**
 * Vorschlag für den Gerätenamen, damit in den Einstellungen nicht mehrere
 * namenlose Einträge stehen: Vorname aus der E-Mail plus Gerätetyp aus dem
 * User-Agent. Frei änderbar – das hier ist nur die Vorbelegung.
 */
function guessLabel(displayName: string | undefined, email: string | undefined, userAgent: string): string {
  // Bevorzugt der am Konto hinterlegte Anzeigename. Die E-Mail taugt nur
  // begrenzt: aus "maiklutz" lässt sich "Maik" nicht zuverlässig herauslesen.
  const local = (email ?? '').split('@')[0].replace(/[._-]?\d+$/, '')
  const first = local.split(/[._-]/)[0]
  const name = displayName?.trim()
    || (first ? first.charAt(0).toUpperCase() + first.slice(1) : 'Gerät')

  const ua = userAgent.toLowerCase()
  const device = ua.includes('ipad') ? 'iPad'
    : ua.includes('iphone') ? 'iPhone'
    : ua.includes('android') ? 'Android'
    : ua.includes('macintosh') ? 'Mac'
    : ua.includes('windows') ? 'PC'
    : null

  return device ? `${name} – ${device}` : name
}

export async function POST(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subscription = await req.json()
  const endpoint = subscription.endpoint

  const label = guessLabel(
    user.user_metadata?.display_name as string | undefined,
    user.email,
    req.headers.get('user-agent') ?? '',
  )

  // Einen selbst vergebenen Namen nicht überschreiben, wenn dasselbe Abo
  // erneuert wird.
  const { data: existing } = await supabase
    .from('push_subscriptions').select('label').eq('endpoint', endpoint).maybeSingle()

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint, subscription, label: existing?.label ?? label },
    { onConflict: 'endpoint' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Abgelöste Abos desselben Geräts entfernen.
  //
  // iOS vergibt beim erneuten Aktivieren einen neuen Endpunkt, das alte Abo
  // blieb bisher für immer liegen. Dadurch sammelten sich Karteileichen an,
  // und in den Einstellungen standen mehrere Einträge fürs selbe Handy –
  // man wusste nicht mehr, welcher davon der lebende ist.
  //
  // "Dasselbe Gerät" heißt hier: gleicher Nutzer, gleicher Name. Der Name
  // enthält den Gerätetyp, ein iPad verdrängt also kein iPhone.
  const { data: abgeloest } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('label', existing?.label ?? label)
    .neq('endpoint', endpoint)
    .select('id')

  return NextResponse.json({ ok: true, label: existing?.label ?? label, abgeloest: abgeloest?.length ?? 0 })
}

export async function DELETE(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = await req.json()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}

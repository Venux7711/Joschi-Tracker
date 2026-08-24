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

function makeAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

async function requireUser() {
  const { data: { user } } = await makeSupabase().auth.getUser()
  return user
}

type Eingang = { brand?: unknown; type?: unknown; quantity?: unknown; size_grams?: unknown }

export async function GET(req: NextRequest) {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const absenceId = req.nextUrl.searchParams.get('absenceId')
  if (!absenceId) return NextResponse.json({ error: 'absenceId fehlt' }, { status: 400 })

  const { data, error } = await makeAdmin()
    .from('absence_supplies').select('*').eq('absence_id', absenceId).order('type')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supplies: data ?? [] })
}

/**
 * Ersetzt den Proviant eines Zeitraums vollständig.
 *
 * Bewusst kein Einzel-Anlegen: Die Oberfläche stellt eine Liste mit Mengen
 * dar, und "so sieht die Liste jetzt aus" lässt sich nicht in eine Folge von
 * Anlegen/Ändern/Löschen zerlegen, ohne dass bei einem Abbruch ein halber
 * Stand zurückbleibt.
 */
export async function PUT(req: NextRequest) {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const absenceId = typeof body.absenceId === 'string' ? body.absenceId : null
  if (!absenceId) return NextResponse.json({ error: 'absenceId fehlt' }, { status: 400 })

  const roh: Eingang[] = Array.isArray(body.supplies) ? body.supplies : []
  const zeilen = roh
    .filter(s => typeof s.brand === 'string' && typeof s.type === 'string')
    .map(s => ({
      absence_id: absenceId,
      brand: String(s.brand).trim(),
      type: String(s.type).trim(),
      quantity: Math.round(Number(s.quantity)),
      size_grams:
        typeof s.size_grams === 'number' && Number.isFinite(s.size_grams)
          ? Math.round(s.size_grams)
          : null,
    }))
    // Menge 0 bedeutet "nicht dabei" – solche Zeilen fallen einfach weg
    .filter(s => s.brand && s.type && Number.isFinite(s.quantity) && s.quantity > 0)

  const admin = makeAdmin()

  const { error: delErr } = await admin.from('absence_supplies').delete().eq('absence_id', absenceId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (zeilen.length === 0) return NextResponse.json({ supplies: [] })

  const { data, error } = await admin.from('absence_supplies').insert(zeilen).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supplies: data ?? [] })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isIsoDay } from '@/lib/time'

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

export async function GET() {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await makeAdmin()
    .from('absences').select('*').order('starts_on', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ absences: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { starts_on, ends_on, label } = await req.json()
  if (!isIsoDay(starts_on) || !isIsoDay(ends_on)) {
    return NextResponse.json({ error: 'Bitte Start und Ende angeben' }, { status: 400 })
  }
  // Vertauschte Daten abfangen, bevor die Datenbank-Prüfung sie mit einer
  // kryptischen Meldung zurückweist
  if (ends_on < starts_on) {
    return NextResponse.json({ error: 'Das Ende liegt vor dem Start' }, { status: 400 })
  }

  const { data, error } = await makeAdmin().from('absences')
    .insert({
      starts_on,
      ends_on,
      label: typeof label === 'string' && label.trim() ? label.trim() : null,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ absence: data })
}

export async function DELETE(req: NextRequest) {
  if (!await requireUser()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  const { error } = await makeAdmin().from('absences').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

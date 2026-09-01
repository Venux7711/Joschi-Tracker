import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { berlinDateKey } from '@/lib/time'
import { dedupeSharedFeedings } from '@/lib/utils'
import { ausHistorie, verbindeMitBestand } from '@/lib/memory/backfill'
import { korrigiere, veralte } from '@/lib/memory/merge'
import { ladeBrauchbare, speichere, speichereVeraltet } from '@/lib/memory/store'
import type { Cat, FeedingLog } from '@/lib/types'

// Das Ableiten geht über die ganze Historie – mehr Zeit als ein normaler Aufruf.
export const maxDuration = 60

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
}

function makeAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function nutzer() {
  const { data: { user } } = await makeSupabase().auth.getUser()
  return user
}

/** Was die App weiß – für die Anzeige aufbereitet. */
export async function GET() {
  if (!await nutzer()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()
  const [{ data: catRows }, { data: memRows }] = await Promise.all([
    admin.from('cats').select('id, name, theme').order('created_at', { ascending: true }),
    admin.from('cat_memories')
      .select('*')
      .in('status', ['active', 'tentative'])
      .order('occurrence_count', { ascending: false })
      .limit(200),
  ])

  const cats = (catRows ?? []) as Cat[]
  const namen = Object.fromEntries(cats.map(c => [c.id, c.name]))

  return NextResponse.json({
    katzen: cats.map(c => ({ id: c.id, name: c.name, theme: c.theme })),
    erinnerungen: (memRows ?? []).map(m => ({
      id: m.id,
      wer: m.subject_type === 'pair' ? 'Beide'
        : m.subject_type === 'household' ? 'Zuhause'
        : namen[m.subject_id] ?? 'Katze',
      subjectId: m.subject_id,
      subjectType: m.subject_type,
      art: m.memory_type,
      titel: m.title,
      beschreibung: m.description,
      anzahl: m.occurrence_count,
      zuversicht: m.confidence,
      status: m.status,
      quelle: m.source,
      seit: String(m.first_seen_at).slice(0, 10),
      zuletzt: String(m.last_seen_at).slice(0, 10),
      fotoIds: m.source_photo_ids ?? [],
    })),
  })
}

/**
 * Etwas eintragen oder die Historie auswerten.
 *
 * Zwei Wege im selben Aufruf, weil beide dasselbe Ergebnis füllen. Mit einem
 * Text im Rumpf entsteht eine Nutzerangabe, ohne wird abgeleitet.
 */
export async function POST(req: NextRequest) {
  if (!await nutzer()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()

  // ── Eine Angabe des Menschen ─────────────────────────────────────────
  // "Bella hasst den Staubsauger" steht auf keinem Foto. Solche Sätze sind
  // das wertvollste Wissen über die beiden und lassen sich nicht ableiten.
  const rumpf = await req.json().catch(() => ({}))
  if (typeof rumpf?.text === 'string' && rumpf.text.trim()) {
    const text = rumpf.text.trim().slice(0, 300)
    const subjectType = ['cat', 'pair', 'household'].includes(rumpf.subjectType)
      ? rumpf.subjectType as 'cat' | 'pair' | 'household'
      : 'household'
    const subjectId = subjectType === 'cat' && typeof rumpf.subjectId === 'string'
      ? rumpf.subjectId
      : null

    if (subjectType === 'cat' && !subjectId) {
      return NextResponse.json({ error: 'Bitte eine Katze auswählen' }, { status: 400 })
    }

    const jetzt = new Date().toISOString()
    const { error } = await admin.from('cat_memories').upsert({
      subject_type: subjectType,
      subject_id: subjectId,
      memory_type: 'user_fact',
      // Der Titel ist der Wiedererkennungsschlüssel. Beim Nutzerwissen ist
      // das der Satz selbst – zweimal dasselbe einzutragen soll nichts
      // Doppeltes erzeugen.
      title: text.toLowerCase(),
      description: text,
      evidence: { fotoIds: [], tage: [] },
      source_photo_ids: [],
      confidence: 1,
      occurrence_count: 1,
      first_seen_at: jetzt,
      last_seen_at: jetzt,
      status: 'user_confirmed',
      source: 'nutzer',
      prompt_version: 'nutzereingabe',
      updated_at: jetzt,
    }, { onConflict: 'subject_type,subject_id,title' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, angelegt: 1 })
  }
  const heute = berlinDateKey(new Date())

  const [{ data: catRows }, { data: fotoRows }, { data: feedRows }, { data: absenceRows }] = await Promise.all([
    admin.from('cats').select('id, name, birthday').order('created_at', { ascending: true }),
    admin.from('photos').select('id, taken_at, place, cat_ids, cat_id')
      .order('taken_at', { ascending: true }).limit(2000),
    admin.from('feeding_logs').select('*').order('logged_at', { ascending: true }).limit(4000),
    // Ohne die Betreuungszeiträume würde ein achttägiger Aufenthalt in
    // Külsheim als Gewohnheit der Katze gelten statt als das, was er war.
    admin.from('absences').select('starts_on, ends_on, label'),
  ])

  const katzen = (catRows ?? []) as { id: string; name: string }[]
  // Geteilte Mahlzeiten nur einmal zählen – sie stehen für beide Katzen drin
  const fuetterungen = dedupeSharedFeedings((feedRows ?? []) as FeedingLog[])

  const abgeleitet = ausHistorie(fotoRows ?? [], fuetterungen, katzen, absenceRows ?? [])

  const bestand = await ladeBrauchbare(admin, 500)
  const zuSchreiben = verbindeMitBestand(abgeleitet, bestand)

  const bilanz = await speichere(
    admin,
    zuSchreiben.map(m => ({ art: 'neu' as const, memory: m })),
    null,
    'ableitung-historie',
  )

  // Bei der Gelegenheit aufräumen: Was zu lange nichts von sich hören ließ,
  // verblasst.
  const frisch = veralte(bestand, heute)
  const verblasst = await speichereVeraltet(admin, bestand, frisch)

  return NextResponse.json({
    abgeleitet: abgeleitet.length,
    geschrieben: bilanz.neu + bilanz.verstaerkt,
    uebersprungen: abgeleitet.length - zuSchreiben.length,
    verblasst,
  })
}

/**
 * Eine Erinnerung korrigieren oder verwerfen.
 *
 * Der Mensch sieht seine Katzen jeden Tag, das Modell sieht drei Fotos. Eine
 * Korrektur bekommt deshalb volle Zuversicht und kann danach von keiner
 * Beobachtung mehr abgewertet werden.
 */
export async function PATCH(req: NextRequest) {
  if (!await nutzer()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, beschreibung, verwerfen } = await req.json()
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'id fehlt' }, { status: 400 })
  }

  const admin = makeAdmin()

  if (verwerfen === true) {
    // Nicht löschen, sondern als überholt markieren: Was einmal beobachtet
    // wurde, bleibt nachlesbar – es fließt nur in keinen Satz mehr ein.
    const { error } = await admin.from('cat_memories')
      .update({ status: 'superseded', source: 'nutzer', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'superseded' })
  }

  if (typeof beschreibung !== 'string' || !beschreibung.trim()) {
    return NextResponse.json({ error: 'Beschreibung fehlt' }, { status: 400 })
  }

  const { data: zeile } = await admin.from('cat_memories').select('*').eq('id', id).maybeSingle()
  if (!zeile) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

  const korrigiert = korrigiere(
    {
      subjectType: zeile.subject_type,
      subjectId: zeile.subject_id,
      memoryType: zeile.memory_type,
      title: zeile.title,
      description: zeile.description,
      evidence: zeile.evidence,
      sourcePhotoIds: zeile.source_photo_ids ?? [],
      confidence: zeile.confidence,
      occurrenceCount: zeile.occurrence_count,
      firstSeenAt: String(zeile.first_seen_at).slice(0, 10),
      lastSeenAt: String(zeile.last_seen_at).slice(0, 10),
      status: zeile.status,
      source: zeile.source,
    },
    zeile.title,
    beschreibung.trim().slice(0, 300),
    berlinDateKey(new Date()),
  )

  const { error } = await admin.from('cat_memories').update({
    description: korrigiert.description,
    confidence: korrigiert.confidence,
    status: korrigiert.status,
    source: korrigiert.source,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { addBerlinDays, berlinDateKey, berlinDayStart, berlinDayEnd, formatBerlin } from '@/lib/time'
import { dedupeSharedFeedings } from '@/lib/utils'
import { birthdayInfo } from '@/lib/birthday'
import {
  STIMMEN, SYSTEM_PROMPT, beschreibeTag, ersatzGedanken, leseAntwort,
  type Stimme, type Tagesbild,
} from '@/lib/thoughts'
import type { Cat, FeedingLog, HealthLog } from '@/lib/types'

// Bilder herunterladen und ein Modell mit Bildern befragen dauert länger als
// eine reine Textanfrage.
export const maxDuration = 60

const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

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

type Bildquelle = { id: string; url: string }

/** Trägt zusammen, was gestern passiert ist – samt der Bilder dazu. */
async function baueTagesbild(
  admin: ReturnType<typeof makeAdmin>,
  gestern: Date,
): Promise<{ bild: Tagesbild; bilder: Bildquelle[] }> {
  const von = berlinDayStart(gestern).toISOString()
  const bis = berlinDayEnd(gestern).toISOString()

  const { data: catRows } = await admin.from('cats').select('*').order('created_at', { ascending: true })
  const cats = (catRows ?? []) as Cat[]
  const catIds = cats.map(c => c.id)
  const nameVon = (id: string | null) => cats.find(c => c.id === id)?.name ?? 'Katze'

  const [{ data: feedRaw }, { data: healthRaw }, { data: photoRaw }, { data: absenceRaw }] = await Promise.all([
    admin.from('feeding_logs').select('*').in('cat_id', catIds).gte('logged_at', von).lte('logged_at', bis),
    admin.from('health_logs').select('*').in('cat_id', catIds).gte('logged_at', von).lte('logged_at', bis),
    admin.from('photos').select('id, taken_at, place, public_url, poster_url, media_type, caption')
      .gte('taken_at', von).lte('taken_at', bis).order('taken_at', { ascending: true }),
    admin.from('absences').select('starts_on, ends_on, label')
      .lte('starts_on', berlinDateKey(gestern)).gte('ends_on', berlinDateKey(gestern)).limit(1),
  ])

  // Gemeinsame Mahlzeiten nur einmal zählen – sonst stünde jede Fütterung
  // doppelt da, weil sie für beide Katzen eingetragen wird.
  const feedings = dedupeSharedFeedings((feedRaw ?? []) as FeedingLog[])
  const zaehler = new Map<string, number>()
  for (const f of feedings) {
    const name = f.food_type || f.food_brand
    zaehler.set(name, (zaehler.get(name) ?? 0) + 1)
  }

  const befinden: Tagesbild['befinden'] = []
  for (const h of (healthRaw ?? []) as HealthLog[]) {
    const was = [
      h.stool_consistency === 'diarrhea' ? 'Durchfall' : null,
      h.stool_consistency === 'soft' ? 'weicher Stuhl' : null,
      h.vomiting ? 'erbrochen' : null,
      h.fur_issue ? 'Kot im Fell' : null,
    ].filter((x): x is string => !!x)
    if (was.length > 0) befinden.push({ katze: nameVon(h.cat_id), was })
  }

  const fotos = photoRaw ?? []
  const orte = Array.from(new Set(fotos.map(p => p.place).filter((p): p is string => !!p)))

  const besonderes: string[] = []
  for (const c of cats) {
    const info = birthdayInfo(c.birthday, gestern)
    if (info?.isToday) besonderes.push(`Besonderes: ${c.name} hatte Geburtstag und wurde ${info.age}.`)
  }
  const abwesenheit = absenceRaw?.[0]
  if (abwesenheit) {
    besonderes.push(`Besonderes: Die Katzen sind gerade nicht zuhause (${abwesenheit.label ?? 'Betreuung'}), jemand anderes füttert.`)
  }

  // Drei Bilder, über den Tag verteilt statt einfach die ersten: Bei fünfzehn
  // Fotos aus derselben Minute sähe die KI sonst dreimal dasselbe. Drei, weil
  // jede der drei Stimmen ein eigenes bekommen soll – seit die Bilder
  // verkleinert übertragen werden, kostet das kaum noch Zeit. Bei Videos das
  // Standbild, Bewegtbilder kann das Modell hier nicht lesen.
  const schritt = Math.max(1, Math.floor(fotos.length / 3))
  const bilder: Bildquelle[] = []
  for (let i = 0; i < fotos.length && bilder.length < 3; i += schritt) {
    const f = fotos[i]
    const url = f.media_type === 'video' ? f.poster_url : f.public_url
    if (url) bilder.push({ id: f.id, url })
  }

  return {
    bild: {
      datum: formatBerlin(gestern, { day: 'numeric', month: 'long' }),
      wochentag: formatBerlin(gestern, { weekday: 'long' }),
      futter: [...zaehler.entries()].map(([name, mal]) => ({ name, mal })),
      befinden,
      fotos: {
        anzahl: fotos.length,
        ersteUhrzeit: fotos[0] ? formatBerlin(fotos[0].taken_at, { hour: '2-digit', minute: '2-digit' }) : null,
        letzteUhrzeit: fotos.at(-1) ? formatBerlin(fotos.at(-1)!.taken_at, { hour: '2-digit', minute: '2-digit' }) : null,
        ort: orte[0] ?? null,
      },
      menschen: [],
      besonderes,
    },
    bilder,
  }
}

type Bildteil = { inline_data: { mime_type: string; data: string } }

/**
 * Verkleinerte Fassung eines Bildes, über den eigenen Bilddienst.
 *
 * Der Grund ist der erste Anlauf: Handyfotos in Originalgröße – acht Megabyte,
 * nach der Umkodierung elf – dauerten samt Modellanfrage länger als die
 * erlaubte Minute, und die Karte blieb schlicht leer. Zum Erkennen einer
 * schlafenden Katze reichen 640 Pixel bei Weitem; damit wird aus elf Megabyte
 * ein Fünfzigstel.
 *
 * Klappt das nicht – etwa lokal ohne Bilddienst –, wird das Original genommen.
 * Lieber langsam als gar nicht.
 */
function kleinereFassung(url: string): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (!host) return url
  return `https://${host}/_next/image?url=${encodeURIComponent(url)}&w=640&q=55`
}

/** Holt eine Datei mit Zeitlimit – ein hängender Abruf darf nicht alles blockieren. */
async function holeMitLimit(url: string, ms: number): Promise<Response | null> {
  const abbruch = new AbortController()
  const uhr = setTimeout(() => abbruch.abort(), ms)
  try {
    return await fetch(url, { signal: abbruch.signal })
  } catch {
    return null
  } finally {
    clearTimeout(uhr)
  }
}

/** Lädt die Fotos herunter und macht Bildteile für die Anfrage daraus. */
async function ladeBilder(urls: string[]): Promise<Bildteil[]> {
  const teile: Bildteil[] = []
  for (const url of urls) {
    // Erst die verkleinerte Fassung, sonst das Original
    let res = await holeMitLimit(kleinereFassung(url), 8_000)
    if (!res?.ok) res = await holeMitLimit(url, 8_000)
    if (!res?.ok) continue

    const typ = res.headers.get('content-type') ?? 'image/jpeg'
    if (!typ.startsWith('image/')) continue

    const puffer = Buffer.from(await res.arrayBuffer())
    // Kam trotzdem etwas Großes zurück, wird es übersprungen statt die
    // Anfrage damit über die Zeit zu bringen.
    if (puffer.byteLength > 2 * 1024 * 1024) continue
    teile.push({ inline_data: { mime_type: typ, data: puffer.toString('base64') } })
  }
  return teile
}

async function frageKi(prompt: string, bilder: Bildteil[]): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) return null

  for (const model of GEMINI_MODELS) {
    // Zeitlimit je Modell: Der zweite Versuch muss noch in die erlaubte
    // Minute passen, sonst läuft die ganze Anfrage in den Abbruch und der
    // Ersatztext kommt nie zum Zug.
    const abbruch = new AbortController()
    const uhr = setTimeout(() => abbruch.abort(), 20_000)
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abbruch.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, ...bilder] }],
          // Höhere Temperatur als bei den Auswertungen: Hier ist Einfallsreichtum
          // erwünscht, nicht Genauigkeit. Das Budget deckt Denken plus drei
          // kurze Sätze ab.
          generationConfig: { maxOutputTokens: 2048, temperature: 1.0 },
        }),
      })
      if (!res.ok) {
        console.error(`Gedanken: ${model} HTTP ${res.status}`)
        continue
      }
      const daten = await res.json()
      const text = daten.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '').join('').trim()
      if (text) return text
    } catch (e) {
      console.error(`Gedanken: ${model} fehlgeschlagen`, e)
    } finally {
      clearTimeout(uhr)
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const { data: { user } } = await makeSupabase().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()
  const jetzt = new Date()
  const gestern = addBerlinDays(jetzt, -1)
  const tag = berlinDateKey(gestern)

  // Archiv: die letzten Tage zum Zurückblättern
  if (req.nextUrl.searchParams.get('archiv') === '1') {
    const { data } = await admin.from('cat_thoughts')
      .select('tag, stimme, text').order('tag', { ascending: false }).limit(90)
    return NextResponse.json({ archiv: data ?? [] })
  }

  const { data: vorhanden } = await admin.from('cat_thoughts')
    .select('stimme, text, erzeugt_von, foto_url, foto_id').eq('tag', tag)

  if (vorhanden && vorhanden.length >= STIMMEN.length) {
    return NextResponse.json({
      tag,
      quelle: vorhanden[0].erzeugt_von,
      gedanken: Object.fromEntries(
        vorhanden.map(z => [z.stimme, { text: z.text, foto: z.foto_url, fotoId: z.foto_id }]),
      ),
    })
  }

  return NextResponse.json(await erzeuge(admin, gestern, tag))
}

/**
 * Nochmal würfeln.
 *
 * Bei einem Gag-Feature ist das kein Luxus: Ein misslungener Satz stünde sonst
 * bis zum nächsten Tag da. Der alte wird dabei überschrieben – ein Archiv aus
 * verworfenen Versuchen hilft niemandem.
 */
export async function POST() {
  const { data: { user } } = await makeSupabase().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = makeAdmin()
  const gestern = addBerlinDays(new Date(), -1)
  const tag = berlinDateKey(gestern)

  await admin.from('cat_thoughts').delete().eq('tag', tag)
  return NextResponse.json(await erzeuge(admin, gestern, tag))
}

async function erzeuge(admin: ReturnType<typeof makeAdmin>, gestern: Date, tag: string) {
  const { bild, bilder } = await baueTagesbild(admin, gestern)
  const bildteile = await ladeBilder(bilder.map(b => b.url))
  const hinweis = bildteile.length > 0
    ? `\n\nDazu ${bildteile.length} Foto(s) von gestern – sieh sie dir an.`
    : '\n\nEs liegen keine Fotos bei.'

  const antwort = await frageKi(
    `${SYSTEM_PROMPT}\n\nDATEN VON GESTERN\n${beschreibeTag(bild)}${hinweis}`,
    bildteile,
  )
  const gelesen = antwort ? leseAntwort(antwort) : null

  // Fehlt eine Stimme, wird nur diese aus dem Ersatz ergänzt – ein halb
  // gelungener Durchlauf soll nicht alles verwerfen.
  const ersatz = ersatzGedanken(bild)
  const quelle = gelesen ? 'ki' : 'ersatz'

  /**
   * Das Bild, auf das sich diese Stimme bezieht.
   *
   * Nur die Bilder, die tatsächlich mitgeschickt wurden, kommen infrage –
   * nennt das Modell eine Nummer, die es gar nicht gibt, wäre das Bild neben
   * dem Satz schlicht falsch. Dann lieber das erste als gar keins: Die Karte
   * soll nicht mal mit und mal ohne Bild dastehen.
   */
  const bildFuer = (nummer: number | null) => {
    const verfuegbar = bilder.slice(0, bildteile.length)
    if (verfuegbar.length === 0) return null
    if (nummer === null || nummer > verfuegbar.length) return verfuegbar[0]
    return verfuegbar[nummer - 1] ?? verfuegbar[0]
  }

  const zeilen = STIMMEN.map(s => {
    const g = gelesen?.[s]
    const foto = bildFuer(g?.bild ?? null)
    return {
      tag, stimme: s,
      text: g?.text ?? ersatz[s],
      grundlage: `${beschreibeTag(bild)}\n(${bildteile.length} Bild(er) angesehen)`.slice(0, 1000),
      erzeugt_von: quelle,
      foto_id: foto?.id ?? null,
      foto_url: foto?.url ?? null,
    }
  })

  // onConflict: Zwei Personen können die Seite gleichzeitig öffnen; die zweite
  // Einfügung darf dann nicht mit einem Fehler abbrechen.
  await admin.from('cat_thoughts').upsert(zeilen, { onConflict: 'tag,stimme' })

  return {
    tag,
    quelle,
    gedanken: Object.fromEntries(
      zeilen.map(z => [z.stimme, { text: z.text, foto: z.foto_url, fotoId: z.foto_id }]),
    ),
  }
}

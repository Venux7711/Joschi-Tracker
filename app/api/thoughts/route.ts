import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { addBerlinDays, berlinDateKey, berlinDayStart, berlinDayEnd, formatBerlin } from '@/lib/time'
import { dedupeSharedFeedings } from '@/lib/utils'
import { birthdayInfo } from '@/lib/birthday'
import {
  STIMMEN, SYSTEM_PROMPT, PROMPT_FASSUNG, beschreibeTag, ersatzGedanken,
  leseAntwort, leseBeobachtungsteil,
  type Stimme, type Tagesbild,
} from '@/lib/thoughts'
import { technikFuer, tagesAnweisung, gleicheForm } from '@/lib/humor'
import { leseBeobachtungen, zuKandidaten } from '@/lib/memory/observe'
import { verschmelze, veralte } from '@/lib/memory/merge'
import { waehleRelevante, alsText, zuAehnlich, type Kontext } from '@/lib/memory/select'
import {
  ladeBrauchbare, speichere, speichereVeraltet, ladeVerwendungen,
  ladeLetzteSaetze, ladeStimmbeispiele, speichereTagesbild,
} from '@/lib/memory/store'
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
): Promise<{
  bild: Tagesbild
  bilder: Bildquelle[]
  /** Katzenname klein → Kennung. Das Modell nennt Namen, das Gedächtnis braucht Kennungen. */
  katzenIds: Record<string, string>
  /** Umgekehrt, für die Formulierung der Erinnerungen. */
  katzenNamen: Record<string, string>
}> {
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
    katzenIds: Object.fromEntries(cats.map(c => [c.name.toLowerCase(), c.id])),
    katzenNamen: Object.fromEntries(cats.map(c => [c.id, c.name])),
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
  const { bild, bilder, katzenIds, katzenNamen } = await baueTagesbild(admin, gestern)
  const bildteile = await ladeBilder(bilder.map(b => b.url))
  const hinweis = bildteile.length > 0
    ? `\n\nDazu ${bildteile.length} Foto(s) von gestern – sieh sie dir an.`
    : '\n\nEs liegen keine Fotos bei.'

  /**
   * Was die App schon weiß, passend zum heutigen Tag.
   *
   * Bewusst so abgesichert, dass ein Ausfall hier den Gedanken nicht kostet:
   * Das Gedächtnis ist eine Verbesserung, keine Voraussetzung. Fällt es aus,
   * entsteht eben ein Satz nur über gestern – so wie bisher auch.
   */
  let bestand: Awaited<ReturnType<typeof ladeBrauchbare>> = []
  let verwendete: string[] = []
  let erinnerungsText = 'Noch keine gesicherten Erinnerungen.'
  let letzteSaetze: string[] = []
  let eigeneStimmen = ''

  try {
    const [geladen, verwendungen, saetze, beispiele] = await Promise.all([
      ladeBrauchbare(admin),
      ladeVerwendungen(admin),
      ladeLetzteSaetze(admin),
      ladeStimmbeispiele(admin),
    ])
    letzteSaetze = saetze

    // Feste Beispielsätze geben den Grundton vor, ändern sich aber nie – ein
    // Charakter, der sich über Monate nicht bewegt, ist eine Schablone. Die
    // eigenen letzten Sätze verankern den Ton in dem, was schon dastand, und
    // lassen ihn sich mit den Katzen mitentwickeln.
    const stimmzeilen = Object.entries(beispiele)
      .filter(([, saetzeDerStimme]) => saetzeDerStimme.length > 0)
      .map(([stimme, saetzeDerStimme]) =>
        `${stimme}: ${saetzeDerStimme.map(s => `"${s}"`).join(' ')}`)
    if (stimmzeilen.length > 0) {
      eigeneStimmen = '\n\nSO HAST DU ZULETZT GEKLUNGEN\n' + stimmzeilen.join('\n')
        + '\nBleib bei diesem Ton, wiederhole aber keinen dieser Sätze.'
    }

    // Verblasstes vor der Auswahl aussortieren, sonst schleppt ein halbes Jahr
    // altes Muster ewig mit.
    const frisch = veralte(geladen, tag)
    speichereVeraltet(admin, geladen, frisch).catch(e => console.error('Veralten:', e))
    bestand = frisch

    const kontext: Kontext = {
      themen: [
        ...(bild.fotos.ort ? [bild.fotos.ort.toLowerCase()] : []),
        ...bild.futter.map(f => f.name.toLowerCase()),
      ],
      katzen: Object.values(katzenIds),
      zusammen: false,
      tag,
      zuletztVerwendet: verwendungen,
    }

    const relevante = waehleRelevante(bestand, kontext)
    verwendete = relevante.map(m => m.id).filter((id): id is string => !!id)
    erinnerungsText = alsText(relevante, katzenNamen)
  } catch (e) {
    console.error('Gedächtnis nicht verfügbar, Gedanke entsteht ohne:', e)
  }

  /**
   * Der Versuch, einen Satz zu bekommen, der nicht wie gestern klingt.
   *
   * Zwei Anläufe: Beim zweiten wird eine andere Technik vorgegeben und
   * ausdrücklich benannt, was am ersten nicht taugte. Das ist deutlich besser
   * als der frühere Weg, bei dem ein zu ähnlicher Satz durch einen Ersatz aus
   * fester Liste ausgetauscht wurde – der klang zuverlässig schlechter als
   * das, was er ersetzte.
   */
  const basis = (versatz: number, tadel = '') => {
    const technik = technikFuer(tag, versatz)
    return `${SYSTEM_PROMPT}${eigeneStimmen}\n\n${tagesAnweisung(technik, letzteSaetze)}${tadel}` +
      `\n\nDATEN VON GESTERN\n${beschreibeTag(bild)}${hinweis}` +
      `\n\nERINNERUNGEN\n${erinnerungsText}`
  }

  let antwort = await frageKi(basis(0), bildteile)
  let gelesen = antwort ? leseAntwort(antwort) : null

  // Kommt dieselbe Satzform wie zuletzt heraus, einmal nachfassen. Genau das
  // war der Befund: fünf von sechs Sätzen in der Form "Ich + Verb + Ort".
  const formGleich = gelesen
    ? STIMMEN.filter(s => gelesen?.[s] && gleicheForm(gelesen[s]!.text, letzteSaetze)).length
    : 0

  if (gelesen && formGleich >= 2) {
    console.log(`Gedanken: ${formGleich} Sätze in alter Form – zweiter Anlauf`)
    const zweite = await frageKi(
      basis(3, '\n\nDein erster Entwurf hatte dieselbe Satzform wie die letzten Tage. ' +
        'Fang anders an und bau die Sätze anders.'),
      bildteile,
    )
    const zweiteGelesen = zweite ? leseAntwort(zweite) : null
    // Nur übernehmen, wenn der zweite Anlauf wirklich besser ist
    if (zweiteGelesen) {
      const nochGleich = STIMMEN.filter(
        s => zweiteGelesen[s] && gleicheForm(zweiteGelesen[s]!.text, letzteSaetze),
      ).length
      if (nochGleich < formGleich) {
        antwort = zweite
        gelesen = zweiteGelesen
      }
    }
  }

  // Beobachtungen ins Gedächtnis einarbeiten. Getrennt abgesichert: Ein Fehler
  // hier darf den fertigen Gedanken nicht kosten.
  if (antwort) {
    try {
      const beobachtungen = leseBeobachtungen(
        leseBeobachtungsteil(antwort),
        bilder.map(b => b.id),
        tag,
      )
      const kandidaten = zuKandidaten(beobachtungen, katzenIds, tag)
      const aenderungen = verschmelze(bestand, kandidaten, tag)
      const bilanz = await speichere(admin, aenderungen, GEMINI_MODELS[0], PROMPT_FASSUNG)
      await speichereTagesbild(admin, tag, beobachtungen, {
        futter: bild.futter,
        fotos: bild.fotos.anzahl,
        befinden: bild.befinden.length,
      }, bild.fotos.anzahl)
      console.log(`Gedächtnis: ${bilanz.neu} neu, ${bilanz.verstaerkt} bestätigt`)
    } catch (e) {
      console.error('Gedächtnis konnte nicht ergänzt werden:', e)
    }
  }

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

    // Nur bei wörtlicher Wiederholung auf den Ersatz ausweichen. Die
    // Formgleichheit ist oben schon behandelt worden, und dafür einen Satz aus
    // fester Liste einzusetzen wäre der falsche Weg: Er klingt zuverlässig
    // schlechter als das, was er ersetzt.
    const text = g?.text && !zuAehnlich(g.text, letzteSaetze) ? g.text : ersatz[s]

    return {
      tag, stimme: s,
      text,
      grundlage: `${beschreibeTag(bild)}\n(${bildteile.length} Bild(er) angesehen)`.slice(0, 1000),
      erzeugt_von: quelle,
      foto_id: foto?.id ?? null,
      foto_url: foto?.url ?? null,
      // Womit gearbeitet wurde: Grundlage für die Ruhezeit der Running Gags
      // und später für die Frage "warum sagt die App das?"
      used_memory_ids: verwendete,
      model_version: GEMINI_MODELS[0],
      prompt_version: PROMPT_FASSUNG,
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

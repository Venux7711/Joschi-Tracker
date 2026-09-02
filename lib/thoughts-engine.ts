/**
 * Die Maschinerie hinter den Katzengedanken.
 *
 * Aus der Route herausgelöst, und das aus einem handfesten Grund: Solange die
 * Erzeugung nur beim Öffnen des Dashboards lief, entstanden Löcher im
 * Gedächtnis. Wer drei Tage nicht hineinsah, verlor die Beobachtungen dieser
 * drei Tage – für immer, denn die Erzeugung fragt immer nur nach gestern.
 * Über ein Jahr summiert sich das zu genau den Lücken, die eine Chronik
 * wertlos machen.
 *
 * Jetzt kann derselbe Ablauf von zwei Stellen aus angestoßen werden: von der
 * Seite, wenn jemand sie öffnet, und nachts vom Zeitgeber, der auch die
 * versäumten Tage nachholt.
 */

import { createServerClient } from '@supabase/ssr'
import { addBerlinDays, berlinDateKey, berlinDayStart, berlinDayEnd, formatBerlin } from '@/lib/time'
import { dedupeSharedFeedings } from '@/lib/utils'
import { birthdayInfo } from '@/lib/birthday'
import {
  STIMMEN, SYSTEM_PROMPT, PROMPT_FASSUNG, beschreibeTag, ersatzGedanken,
  leseAntwort, leseBeobachtungsteil,
  type Stimme, type Tagesbild,
} from '@/lib/thoughts'
import { tagesAnweisung, waehleBesten, istPremisse, type Premisse } from '@/lib/humor'
import { waehleFotos } from '@/lib/photo-select'
import { leseBeobachtungen, zuKandidaten } from '@/lib/memory/observe'
import { verschmelze, veralte } from '@/lib/memory/merge'
import { waehleRelevante, alsText, zuAehnlich, type Kontext } from '@/lib/memory/select'
import {
  ladeBrauchbare, speichere, speichereVeraltet, ladeVerwendungen,
  ladeLetzteSaetze, ladeStimmbeispiele, speichereTagesbild,
} from '@/lib/memory/store'
import type { Cat, FeedingLog, HealthLog } from '@/lib/types'

const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export function makeAdmin() {
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
  versatz: number,
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
    // cat_ids mitlesen: Die Fotoauswahl bevorzugt eine Situation, auf der
    // beide zu sehen sind – dafür muss sie die Markierung kennen.
    admin.from('photos').select('id, taken_at, place, cat_ids, cat_id, public_url, poster_url, media_type, caption')
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

  /**
   * Bis zu fünf Bilder statt drei.
   *
   * An einem gewöhnlichen Tag entstehen hier vier bis sechs Fotos. Bei drei
   * ausgewählten sah das Modell also nur die Hälfte, und auf die Klage
   * "immer dieselben drei" gab es eine unbequeme Antwort: Es waren fast alle,
   * die es gab. Mit fünf sieht es an den meisten Tagen alles – und hat
   * entsprechend mehr, worüber es schreiben kann.
   *
   * Seit die Bilder auf 640 Pixel verkleinert übertragen werden, kosten zwei
   * weitere kaum Zeit. Das war bei acht Megabyte je Bild noch anders.
   */
  const bilder: Bildquelle[] = waehleFotos(fotos, 5, versatz)

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

export async function erzeuge(
  admin: ReturnType<typeof makeAdmin>,
  gestern: Date,
  tag: string,
  /**
   * Verschiebt die Fotoauswahl. Beim Würfeln kommt hier ein anderer Wert
   * herein, damit derselbe Tag eine andere Geschichte erzählen kann – vorher
   * lagen bei jedem Wurf dieselben drei Bilder vor und nur der Text änderte
   * sich.
   */
  versatz = 0,
) {
  const { bild, bilder, katzenIds, katzenNamen } = await baueTagesbild(admin, gestern, versatz)
  const bildteile = await ladeBilder(bilder.map(b => b.url))
  const hinweis = bildteile.length > 0
    // Die Gesamtzahl mitzunennen ist nicht kosmetisch: Bei fünfzehn Fotos und
    // drei Bildern soll das Modell wissen, dass es einen Ausschnitt sieht, und
    // nicht behaupten, das sei alles gewesen.
    ? `\n\nDazu ${bildteile.length} von ${bild.fotos.anzahl} Fotos des Tages – sieh sie dir an.`
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
  // Welche Ansätze zuletzt dran waren – Grundlage für die Abwechslung, die
  // hier aus der Bewertung entsteht und nicht aus einem Kalender.
  let letztePremissen: Premisse[] = []
  // Stichworte der eingeflossenen Erinnerungen: Ein Satz, der eine davon
  // aufgreift, ist belegt konkret und kein beliebiger Katzensatz.
  let verwendeteTitel: string[] = []

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
    verwendeteTitel = relevante.map(m => m.title.toLowerCase())
    erinnerungsText = alsText(relevante, katzenNamen)

    const { data: fruehere } = await admin.from('cat_thoughts')
      .select('premise').order('tag', { ascending: false }).limit(12)
    letztePremissen = (fruehere ?? [])
      .map(z => (z as { premise: string | null }).premise)
      .filter(istPremisse)
  } catch (e) {
    console.error('Gedächtnis nicht verfügbar, Gedanke entsteht ohne:', e)
  }

  const antwort = await frageKi(
    `${SYSTEM_PROMPT}${eigeneStimmen}\n\n${tagesAnweisung(letzteSaetze, letztePremissen)}` +
    `\n\nDATEN VON GESTERN\n${beschreibeTag(bild)}${hinweis}` +
    `\n\nERINNERUNGEN\n${erinnerungsText}`,
    bildteile,
  )
  const gelesen = antwort ? leseAntwort(antwort) : null

  /**
   * Was heute überhaupt konkret ist.
   *
   * Grundlage für die Prüfung, ob ein Satz nur auf diesen Haushalt zutrifft
   * oder in jeder Katzen-App stehen könnte.
   */
  const anker = [
    ...bild.futter.map(f => f.name.toLowerCase()),
    ...(bild.fotos.ort ? [bild.fotos.ort.toLowerCase()] : []),
    ...Object.values(katzenNamen).map(n => n.toLowerCase()),
    ...verwendeteTitel,
  ]

  /** Bella redet knapper als Joschi – das gehört zu ihrer Stimme. */
  const zielLaenge: Record<Stimme, number> = { joschi: 14, bella: 10, beide: 16 }

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

  /**
   * Aus den Vorschlägen wird ausgewählt, nicht der erste genommen.
   *
   * Die Bewertung läuft hier und nicht im Modell: Ein Modell, das seine
   * eigenen Vorschläge benotet, benotet sie gut. Hier ist nachvollziehbar,
   * warum ein Satz gewonnen hat – und im Protokoll steht es auch.
   */
  const zeilen = STIMMEN.map(s => {
    const vorschlaege = gelesen?.[s] ?? []
    const gewaehlt = vorschlaege.length > 0
      ? waehleBesten(vorschlaege, {
          anker,
          letzteSaetze,
          letztePremissen,
          zielLaenge: zielLaenge[s],
        })
      : null

    if (vorschlaege.length > 0 && !gewaehlt) {
      console.log(`Gedanken/${s}: alle ${vorschlaege.length} Vorschläge abgelehnt`)
    } else if (gewaehlt) {
      console.log(
        `Gedanken/${s}: ${vorschlaege.length} Vorschläge, gewählt ` +
        `(${gewaehlt.bewertung.punkte}, ${gewaehlt.bewertung.gruende.join(', ') || 'ohne Auffälligkeit'})`,
      )
    }

    // Ersatz nur, wenn wirklich nichts brauchbar war – nicht als Strafe für
    // einen schwachen Satz. Er klingt zuverlässig schlechter als das, was er
    // ersetzt.
    const text = gewaehlt?.kandidat.text ?? ersatz[s]
    const foto = bildFuer(gewaehlt?.kandidat.bild ?? null)

    return {
      tag, stimme: s,
      text,
      grundlage: `${beschreibeTag(bild)}\n(${bildteile.length} Bild(er) angesehen)`.slice(0, 1000),
      erzeugt_von: gewaehlt ? quelle : 'ersatz',
      foto_id: foto?.id ?? null,
      foto_url: foto?.url ?? null,
      // Womit gearbeitet wurde: Grundlage für die Ruhezeit der Running Gags
      // und später für die Frage "warum sagt die App das?"
      used_memory_ids: verwendete,
      premise: gewaehlt?.kandidat.premisse ?? null,
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

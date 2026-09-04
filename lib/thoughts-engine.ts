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
import { addBerlinDays, berlinDateKey, berlinDayStart, berlinDayEnd, berlinDaysBetween, formatBerlin } from '@/lib/time'
import { dedupeSharedFeedings } from '@/lib/utils'
import { birthdayInfo } from '@/lib/birthday'
import {
  STIMMEN, SYSTEM_PROMPT, PROMPT_FASSUNG, beschreibeTag, ersatzGedanken,
  leseAntwort, leseBeobachtungsteil, zeitraumAnweisung,
  type Stimme, type Tagesbild, type Zeitraum,
} from '@/lib/thoughts'
import { tagesAnweisung, waehleBesten, bewerte, istPremisse, type Premisse } from '@/lib/humor'
import { waehleFotos, waehleFotosUeberTage, type Auswahl as Bildquelle } from '@/lib/photo-select'
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


/**
 * Der Ausschnitt, über den geredet wird.
 *
 * Alles darunter arbeitet mit diesem Fenster statt mit einem einzelnen Datum.
 * Der Schlüssel `tag` bleibt der letzte Tag des Fensters – so bleibt die
 * Sortierung im Archiv chronologisch, egal wie breit das Fenster war.
 */
export type Fenster = {
  zeitraum: Zeitraum
  /** Erster Tag, einschließlich. */
  von: Date
  /** Letzter Tag, einschließlich. Zugleich der Schlüssel in der Datenbank. */
  bis: Date
  tag: string
  /** Wie der Zeitraum in der App heißt, z. B. "Vor einem Jahr". */
  titel: string
  /**
   * Verschiebt die Fotoauswahl, ohne dass jemand würfelt.
   *
   * Ein rollendes Fenster verschiebt sich täglich nur um einen Tag – sechs von
   * sieben Tagen sind dieselben wie gestern. Ohne diesen Wert läge deshalb an
   * jedem Tag fast dieselbe Bildauswahl vor, und der Rückblick sähe aus wie
   * der von gestern. Aus dem Schlüsseldatum abgeleitet: verlässlich derselbe
   * Wert innerhalb eines Tages, ein anderer am nächsten.
   */
  grundversatz: number
}

/** Aus einem Datum eine kleine, aber täglich wechselnde Zahl. */
function versatzAus(tag: string): number {
  let summe = 0
  for (let i = 0; i < tag.length; i++) summe += tag.charCodeAt(i) * (i + 1)
  return summe % 7
}

/** Gestern – der Zeitraum, mit dem alles angefangen hat. */
export function tagesFenster(gestern: Date): Fenster {
  return {
    zeitraum: 'tag',
    von: gestern,
    bis: gestern,
    tag: berlinDateKey(gestern),
    titel: formatBerlin(gestern, { weekday: 'long', day: 'numeric', month: 'long' }),
    // Ein einzelner Tag verschiebt sich nicht; hier gibt es nichts auszugleichen.
    grundversatz: 0,
  }
}

/**
 * Die sieben Tage bis gestern.
 *
 * Rollend statt Kalenderwoche. Eine Kalenderwoche wäre montags vollständig und
 * bis dahin ein Fragment – am Dienstag stünde ein "Rückblick" über anderthalb
 * Tage da. Rollend ist die Karte an jedem Tag gleich viel wert.
 */
export function wochenFenster(gestern: Date): Fenster {
  const von = addBerlinDays(gestern, -6)
  return {
    zeitraum: 'woche',
    von,
    bis: gestern,
    tag: berlinDateKey(gestern),
    titel: `${formatBerlin(von, { day: 'numeric', month: 'short' })} – ${formatBerlin(gestern, { day: 'numeric', month: 'short' })}`,
    grundversatz: versatzAus(berlinDateKey(gestern)),
  }
}

/**
 * Die dreißig Tage bis gestern.
 *
 * Was ein Monat kann und eine Woche noch nicht: Er zeigt, was geblieben ist.
 * Eine Woche zeigt, dass sich etwas geändert hat; ein Monat zeigt, dass etwas
 * zur Gewohnheit geworden ist – oder dass es aufgehört hat, ohne dass es
 * jemand gemerkt hat.
 */
export function monatsFenster(gestern: Date): Fenster {
  const von = addBerlinDays(gestern, -29)
  return {
    zeitraum: 'monat',
    von,
    bis: gestern,
    tag: berlinDateKey(gestern),
    titel: `${formatBerlin(von, { day: 'numeric', month: 'long' })} – ${formatBerlin(gestern, { day: 'numeric', month: 'long' })}`,
    grundversatz: versatzAus(berlinDateKey(gestern)),
  }
}

/** Ab wann ein Tag als "damals" gilt, und wie viel auf ihm los gewesen sein muss. */
const DAMALS_AB_TAGEN = 30
const DAMALS_MINDESTFOTOS = 3
/** Ein Tag, der genug für einen Streifen aus Stationen hergibt. */
const DAMALS_REICHLICH = 5

/**
 * Wie ein Tag benannt wird, der lange zurückliegt.
 *
 * Aus dem Abstand statt aus dem Datum: "Vor einem Jahr" trifft, "am 3. Mai
 * 2025" muss man erst ausrechnen.
 */
export function damalsTitel(abstandTage: number): string {
  if (abstandTage >= 350 && abstandTage <= 380) return 'Vor einem Jahr'
  if (abstandTage >= 700) return `Vor ${Math.round(abstandTage / 365)} Jahren`
  if (abstandTage >= 60) return `Vor ${Math.round(abstandTage / 30)} Monaten`
  return `Vor ${abstandTage} Tagen`
}

/**
 * Der Griff ins Archiv.
 *
 * Die erste Fassung nahm den Tag mit den meisten Fotos rund um den Jahrestag.
 * Das klang gut und war stehengeblieben: Weil sich das Suchfenster täglich nur
 * um einen Tag verschiebt, gewann tagelang derselbe Tag, und weil die Karte
 * unter seinem Datum abgelegt wird, war es dann auch buchstäblich dieselbe
 * Karte. Ein Rückblick, der eine Woche lang derselbe ist, ist kein Rückblick.
 *
 * Jetzt wandert die Auswahl. Alle Tage des Archivs, an denen genug passiert
 * ist, bilden eine Reihe, und der heutige Tag zeigt auf eine Stelle darin –
 * morgen auf die nächste. Deterministisch, also innerhalb eines Tages stabil,
 * und über Monate hinweg kommt jeder Tag einmal dran.
 *
 * Der Jahrestag hat Vorrang, wenn es ihn gibt: "Heute vor einem Jahr" ist der
 * eine Fall, in dem ein bestimmter Tag mehr wert ist als ein beliebiger.
 *
 * Gibt es kein Archiv, kommt null zurück und die App bietet den Zeitraum gar
 * nicht erst an: Ein Knopf, der ins Leere führt, ist schlimmer als keiner.
 */
export async function damalsFenster(
  admin: ReturnType<typeof makeAdmin>,
  heute: Date,
): Promise<Fenster | null> {
  const { data } = await admin.from('photos')
    .select('taken_at')
    .lte('taken_at', berlinDayEnd(addBerlinDays(heute, -DAMALS_AB_TAGEN)).toISOString())
    .order('taken_at', { ascending: false })
    .limit(5000)

  if (!data?.length) return null

  const proTag = new Map<string, number>()
  for (const p of data) {
    const schluessel = berlinDateKey((p as { taken_at: string }).taken_at)
    proTag.set(schluessel, (proTag.get(schluessel) ?? 0) + 1)
  }

  /**
   * Nur Tage, an denen genug los war.
   *
   * In Stufen, weil ein einzelnes Foto keinen Rückblick ergibt: Die Karte
   * zeigt die Bilder als Stationen zum Durchtippen, und bei einem einzigen
   * sieht sie kaputt aus. Gibt es keine ergiebigen Tage, ist ein magerer immer
   * noch besser als gar kein Zeitraum.
   */
  const alleTage = [...proTag.entries()]
  const kandidaten = (
    alleTage.filter(([, n]) => n >= DAMALS_REICHLICH).length > 0
      ? alleTage.filter(([, n]) => n >= DAMALS_REICHLICH)
      : alleTage.filter(([, n]) => n >= DAMALS_MINDESTFOTOS).length > 0
        ? alleTage.filter(([, n]) => n >= DAMALS_MINDESTFOTOS)
        : alleTage
  ).map(([t]) => t).sort()

  if (kandidaten.length === 0) return null

  /** Der Jahrestag, wenn an ihm (oder tags daneben) etwas los war. */
  const jahrestag = () => {
    for (const jahre of [1, 2, 3]) {
      const ziel = berlinDayStart(addBerlinDays(heute, -365 * jahre)).getTime()
      const treffer = kandidaten.find(t =>
        Math.abs(berlinDayStart(`${t}T12:00:00Z`).getTime() - ziel) <= 30 * 3_600_000)
      if (treffer) return treffer
    }
    return null
  }

  // Sonst wandert die Auswahl Tag für Tag durch das Archiv.
  const stelle = Math.floor(berlinDayStart(heute).getTime() / 86_400_000)
  const gewaehlt = jahrestag() ?? kandidaten[((stelle % kandidaten.length) + kandidaten.length) % kandidaten.length]

  const datum = berlinDayStart(`${gewaehlt}T12:00:00Z`)
  return {
    zeitraum: 'damals',
    von: datum,
    bis: datum,
    tag: gewaehlt,
    titel: `${damalsTitel(berlinDaysBetween(datum, heute))} · ${formatBerlin(datum, { day: 'numeric', month: 'long', year: 'numeric' })}`,
    // Der Tag selbst wechselt schon; die Bilder daraus müssen es nicht auch.
    grundversatz: 0,
  }
}

/** Trägt zusammen, was im Fenster passiert ist – samt der Bilder dazu. */
async function baueBild(
  admin: ReturnType<typeof makeAdmin>,
  fenster: Fenster,
  versatz: number,
): Promise<{
  bild: Tagesbild
  bilder: Bildquelle[]
  /** Foto-Kennung → wer darauf markiert ist. Bestimmt die Perspektive der Sätze. */
  bildInfo: Map<string, string>
  /** Foto-Kennung → Beschriftung in der App, z. B. "Mi, 27. Aug". Nur mehrtägig. */
  bildDatum: Map<string, string>
  /** Katzenname klein → Kennung. Das Modell nennt Namen, das Gedächtnis braucht Kennungen. */
  katzenIds: Record<string, string>
  /** Umgekehrt, für die Formulierung der Erinnerungen. */
  katzenNamen: Record<string, string>
}> {
  const { von: erster, bis: letzter } = fenster
  const mehrtaegig = berlinDateKey(erster) !== berlinDateKey(letzter)
  const von = berlinDayStart(erster).toISOString()
  const bis = berlinDayEnd(letzter).toISOString()

  const { data: catRows } = await admin.from('cats').select('*').order('created_at', { ascending: true })
  const cats = (catRows ?? []) as Cat[]
  const catIds = cats.map(c => c.id)
  const nameVon = (id: string | null) => cats.find(c => c.id === id)?.name ?? 'Katze'

  const [{ data: feedRaw }, { data: healthRaw }, { data: photoRaw }, { data: absenceRaw }] = await Promise.all([
    admin.from('feeding_logs').select('*').in('cat_id', catIds).gte('logged_at', von).lte('logged_at', bis),
    admin.from('health_logs').select('*').in('cat_id', catIds).gte('logged_at', von).lte('logged_at', bis),
    // cat_ids mitlesen: Die Fotoauswahl bevorzugt eine Situation, auf der
    // beide zu sehen sind – dafür muss sie die Markierung kennen.
    admin.from('photos').select('id, taken_at, place, cat_ids, cat_id, public_url, poster_url, media_type, caption, thumb_url, view_url')
      .gte('taken_at', von).lte('taken_at', bis).order('taken_at', { ascending: true }),
    // Überlappung statt Punkttreffer: Bei einem Wochenfenster zählt jede
    // Betreuung, die irgendwann in diese sieben Tage hineinragt.
    admin.from('absences').select('starts_on, ends_on, label')
      .lte('starts_on', berlinDateKey(letzter)).gte('ends_on', berlinDateKey(erster)).limit(1),
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
    // Bei einem mehrtägigen Fenster jeden Tag prüfen – ein Geburtstag am
    // Mittwoch gehört in den Wochenrückblick, auch wenn er nicht der letzte
    // Tag war.
    for (let i = 0; i <= berlinDaysBetween(erster, letzter); i++) {
      const info = birthdayInfo(c.birthday, addBerlinDays(erster, i))
      if (info?.isToday) {
        besonderes.push(`Besonderes: ${c.name} hatte Geburtstag und wurde ${info.age}.`)
        break
      }
    }
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
  // Ein Monat ist weiter auseinander als eine Woche und verträgt ein Bild mehr.
  const anzahlBilder = fenster.zeitraum === 'monat' ? 6 : 5

  const bilder: Bildquelle[] = mehrtaegig
    // Über mehrere Tage zuerst nach Tagen aufteilen. Sonst bestünde eine
    // Woche mit einer Sonntagsserie von dreißig Bildern nur aus Sonntag.
    ? waehleFotosUeberTage(fotos, anzahlBilder, versatz, f => berlinDateKey(f.taken_at))
    : waehleFotos(fotos, anzahlBilder, versatz)

  /**
   * Wer ist auf welchem Bild markiert?
   *
   * Ohne diese Angabe schrieb jede Stimme zu jedem Foto in der Ich-Form –
   * auch zu Bildern, auf denen sie gar nicht war. Bella kommentierte einen
   * laufenden Fernseher mit "ich schaue lieber weg", während in Wahrheit
   * Joschi davorsaß und wegsah. Die Markierung steht in der Datenbank; sie
   * dem Modell vorzuenthalten hieß, es raten zu lassen.
   */
  const bildInfo = new Map<string, string>()
  for (const b of bilder) {
    const zeile = fotos.find(f => f.id === b.id)
    if (!zeile) continue
    const markiert: string[] = zeile.cat_ids?.length
      ? zeile.cat_ids
      : zeile.cat_id ? [zeile.cat_id] : []
    const namen = markiert.map(id => nameVon(id))
    const wer = namen.length === 0
      ? 'niemand markiert – entscheide nach dem Aussehen'
      : `markiert: ${namen.join(' und ')}`
    const uhrzeit = formatBerlin(zeile.taken_at, { hour: '2-digit', minute: '2-digit' })
    // Bei mehreren Tagen ist der Wochentag die wichtigere Angabe: Ein Satz
    // über eine Woche muss wissen, ob das Bild vom Anfang oder vom Ende ist.
    const wann = mehrtaegig
      ? `${formatBerlin(zeile.taken_at, { weekday: 'long' })}, ${uhrzeit}`
      : uhrzeit
    bildInfo.set(b.id, `${wer}, ${wann}${zeile.place ? `, ${zeile.place}` : ''}`)
  }

  /**
   * Je Bild die Beschriftung, die in der App unter der Station steht.
   *
   * Über mehrere Tage der Wochentag mit Datum, an einem einzelnen alten Tag
   * die Uhrzeit. Ohne Beschriftung sah der Streifen bei "Damals" aus, als
   * gäbe es nur ein einziges Bild – die übrigen standen unbeschriftet daneben
   * und wirkten wie Zierrat.
   *
   * Nur beim gestrigen Tag bleibt es leer: Dort ist die Uhrzeit ohnehin
   * belanglos, und die Marke am großen Bild sagt schon, worum es geht.
   */
  const bildDatum = new Map<string, string>()
  if (mehrtaegig || fenster.zeitraum !== 'tag') {
    for (const b of bilder) {
      const zeile = fotos.find(f => f.id === b.id)
      if (!zeile) continue
      bildDatum.set(b.id, mehrtaegig
        ? formatBerlin(zeile.taken_at, { weekday: 'short', day: 'numeric', month: 'short' })
        : formatBerlin(zeile.taken_at, { hour: '2-digit', minute: '2-digit' }))
    }
  }

  /**
   * Der Verlauf über die Tage.
   *
   * Nur bei mehrtägigen Fenstern. Er ist der eigentliche Stoff: Aus "14×
   * Nautilus" wird kein Rückblick, aus "an vier Tagen dasselbe, dann nicht
   * mehr" schon.
   */
  let spanne: Tagesbild['spanne']
  if (mehrtaegig) {
    const tage = berlinDaysBetween(erster, letzter)
    const verlauf: NonNullable<Tagesbild['spanne']>['verlauf'] = []
    for (let i = 0; i <= tage; i++) {
      const datum = addBerlinDays(erster, i)
      const schluessel = berlinDateKey(datum)
      const sorten = Array.from(new Set(
        feedings
          .filter(f => berlinDateKey(f.logged_at) === schluessel)
          .map(f => f.food_type || f.food_brand),
      ))
      verlauf.push({
        wochentag: formatBerlin(datum, { weekday: 'long' }),
        datum: formatBerlin(datum, { day: 'numeric', month: 'long' }),
        futter: sorten,
        fotos: fotos.filter(p => berlinDateKey(p.taken_at) === schluessel).length,
      })
    }
    spanne = {
      tage: tage + 1,
      vonBis: `${formatBerlin(erster, { weekday: 'short', day: 'numeric', month: 'long' })} bis ${formatBerlin(letzter, { weekday: 'short', day: 'numeric', month: 'long' })}`,
      verlauf,
    }
  }

  return {
    bild: {
      datum: formatBerlin(letzter, { day: 'numeric', month: 'long', ...(fenster.zeitraum === 'damals' ? { year: 'numeric' } : {}) }),
      wochentag: formatBerlin(letzter, { weekday: 'long' }),
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
      spanne,
    },
    bilder,
    bildInfo,
    bildDatum,
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
  /**
   * Ohne eigene Qualitätsstufe – und das ist kein Detail.
   *
   * Hier stand q=55. Jede Kombination aus Adresse, Breite und Qualität ist
   * eine eigene Transformation, und die Galerie fragt dasselbe Foto in
   * derselben Breite mit der Voreinstellung an. Die nächtliche Bildanalyse
   * verdoppelte damit den Verbrauch für jedes Foto, das sie ansieht: einmal
   * für die App, einmal für sich.
   *
   * Ohne die Angabe trifft sie denselben Zwischenspeicher wie die Galerie und
   * kostet für ein bereits angesehenes Foto gar nichts mehr. Die paar Kilobyte
   * mehr fallen bei 640 Pixeln nicht ins Gewicht.
   */
  return `https://${host}/_next/image?url=${encodeURIComponent(url)}&w=640`
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
/**
 * Ein geladenes Bild – zusammen mit dem Foto, aus dem es stammt.
 *
 * Die Verbindung muss erhalten bleiben. Vorher gab ladeBilder nur die Teile
 * zurück und übersprang, was sich nicht laden ließ; die Zuordnung "Bild 2 der
 * Anfrage" zu "zweites Foto der Auswahl" stimmte danach nicht mehr. Scheiterte
 * das zweite von fünf Fotos, sah das Modell vier Bilder, und jeder Satz ab dem
 * zweiten landete unter dem falschen Foto. Bei einer Karte, die den Satz neben
 * sein Bild stellt, ist das genau der Fehler, den man sieht.
 */
type Geladen = { quelle: Bildquelle; teil: Bildteil }

async function ladeBilder(quellen: Bildquelle[]): Promise<Geladen[]> {
  const geladen: Geladen[] = []
  for (const quelle of quellen) {
    const url = quelle.url
    // Erst die verkleinerte Fassung, sonst das Original
    // Liegt eine verkleinerte Fassung vor, ist sie schon klein genug – dann
    // wird der Bilddienst gar nicht erst bemüht.
    let res = await holeMitLimit(quelle.abgeleitet ? url : kleinereFassung(url), 8_000)
    if (!res?.ok) res = await holeMitLimit(url, 8_000)
    if (!res?.ok) continue

    const typ = res.headers.get('content-type') ?? 'image/jpeg'
    if (!typ.startsWith('image/')) continue

    const puffer = Buffer.from(await res.arrayBuffer())
    // Kam trotzdem etwas Großes zurück, wird es übersprungen statt die
    // Anfrage damit über die Zeit zu bringen.
    if (puffer.byteLength > 2 * 1024 * 1024) continue
    geladen.push({
      quelle,
      teil: { inline_data: { mime_type: typ, data: puffer.toString('base64') } },
    })
  }
  return geladen
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
          // erwünscht, nicht Genauigkeit.
          //
          // Das Budget stand auf 2048 und der Kommentar daneben verriet, warum:
          // "deckt Denken plus drei kurze Sätze ab". Das stimmte, als es drei
          // Sätze waren. Inzwischen sind es je Stimme ein Fazit und ein Satz je
          // Bild, also bis zu einundzwanzig, dazu die Beobachtungen zu jedem
          // Bild. Die Antwort brach mitten im JSON ab, das Lesen scheiterte,
          // und die Karte fiel auf den Ersatztext zurück - sichtbar daran,
          // dass ausgerechnet der Rueckblick mit den meisten Bildern gar keine
          // Zeilen hatte.
          generationConfig: { maxOutputTokens: 8192, temperature: 1.0 },
        }),
      })
      if (!res.ok) {
        console.error(`Gedanken: ${model} HTTP ${res.status}`)
        continue
      }
      const daten = await res.json()
      const kandidat = daten.candidates?.[0]
      const text = kandidat?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '').join('').trim()

      // Der Abbruchgrund ist die einzige Stelle, an der eine abgeschnittene
      // Antwort sich zu erkennen gibt. Ohne diese Zeile sieht ein zu kleines
      // Budget genauso aus wie ein Modell, das nichts Brauchbares liefert.
      if (kandidat?.finishReason && kandidat.finishReason !== 'STOP') {
        console.error(`Gedanken: ${model} endete mit ${kandidat.finishReason}`)
      }
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
  fenster: Fenster,
  /**
   * Verschiebt die Fotoauswahl. Beim Würfeln kommt hier ein anderer Wert
   * herein, damit derselbe Tag eine andere Geschichte erzählen kann – vorher
   * lagen bei jedem Wurf dieselben drei Bilder vor und nur der Text änderte
   * sich.
   */
  versatz = 0,
) {
  const { zeitraum, tag } = fenster
  // Der Grundversatz sorgt dafür, dass ein rollendes Fenster nicht täglich
  // fast dieselben Bilder vorlegt; das Würfeln kommt oben drauf.
  const { bild, bilder, bildInfo, bildDatum, katzenIds, katzenNamen } =
    await baueBild(admin, fenster, versatz + fenster.grundversatz)
  const geladen = await ladeBilder(bilder)
  const bildteile = geladen.map(g => g.teil)

  /**
   * Die Bildliste, die dem Modell beiliegt.
   *
   * Nummeriert wird über die geladenen Bilder, nicht über die ausgewählten:
   * Nur so meint "Bild 3" in der Antwort dasselbe Foto wie "Bild 3" in der
   * Anfrage, auch wenn eines nicht geladen werden konnte.
   */
  const bildListe = geladen
    .map((g, i) => `Bild ${i + 1}: ${bildInfo.get(g.quelle.id) ?? 'niemand markiert – entscheide nach dem Aussehen'}`)
    .join('\n')

  const hinweis = bildteile.length > 0
    // Die Gesamtzahl mitzunennen ist nicht kosmetisch: Bei fünfzehn Fotos und
    // drei Bildern soll das Modell wissen, dass es einen Ausschnitt sieht, und
    // nicht behaupten, das sei alles gewesen.
    ? `\n\nDazu ${bildteile.length} von ${bild.fotos.anzahl} Fotos des Tages – sieh sie dir an.\n${bildListe}`
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
    //
    // Gemessen am heutigen Datum, nicht am Fenster: Bei "Damals" ist das
    // Fenster ein Jahr alt, und danach gerechnet wäre nichts je verblasst.
    const frisch = veralte(geladen, berlinDateKey(new Date()))
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
    `${SYSTEM_PROMPT}${eigeneStimmen}${zeitraumAnweisung(zeitraum)}` +
    `\n\n${tagesAnweisung(letzteSaetze, letztePremissen)}` +
    `\n\n${zeitraum === 'tag' ? 'DATEN VON GESTERN' : 'DATEN DES ZEITRAUMS'}\n${beschreibeTag(bild)}${hinweis}` +
    `\n\nERINNERUNGEN\n${erinnerungsText}`,
    bildteile,
  )
  const gelesen = antwort ? leseAntwort(antwort) : null

  /**
   * Was das Modell selbst auf jedem Bild gesehen hat.
   *
   * Bisher nur fürs Gedächtnis gelesen, jetzt auch für die Perspektive – und
   * das ist der Punkt: Die Markierung in der Datenbank ist von Hand gesetzt
   * und war nachweislich schon falsch. Auf dem Ofen-Foto vom 1. September
   * steht Bella, zu sehen ist Joschi; beide Stimmen redeten übereinstimmend
   * über ihn und widersprachen damit der Angabe, die die Anweisung für
   * verbindlich erklärte.
   *
   * Die eigene Wahrnehmung des Modells ist hier die verlässlichere Quelle:
   * Sie stammt aus demselben Blick auf dasselbe Bild, aus dem auch der Satz
   * entsteht. Damit wird die Prüfung überhaupt erst möglich – steht auf einem
   * Bild nur die sprechende Katze, muss ihr Satz in der Ich-Form stehen.
   */
  const beobachtungen = antwort
    ? leseBeobachtungen(leseBeobachtungsteil(antwort), geladen.map(g => g.quelle.id), tag)
    : []

  const gesehenAuf = new Map<string, Set<string>>()
  for (const b of beobachtungen) {
    if (!b.fotoId) continue
    const wer = gesehenAuf.get(b.fotoId) ?? new Set<string>()
    if (b.subjectType === 'pair') for (const n of Object.keys(katzenIds)) wer.add(n)
    else if (b.katze) wer.add(b.katze.toLowerCase())
    gesehenAuf.set(b.fotoId, wer)
  }

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

  /**
   * Wer unter welcher Stimme spricht.
   *
   * Damit die Bewertung einen Satz ablehnen kann, in dem die Stimme über sich
   * selbst in der dritten Person redet. Beim Zwiegespräch steht der Name in
   * jeder Zeile davor, dort wird er von dort gelesen.
   */
  const sprecherVon: Record<Stimme, string | null> = {
    joschi: katzenNamen[katzenIds['joschi']] ?? 'Joschi',
    bella: katzenNamen[katzenIds['bella']] ?? 'Bella',
    beide: null,
  }

  /**
   * Kommt aus diesem Durchgang neues Wissen ins Gedächtnis?
   *
   * Nicht immer, und der Grund ist der Zähler: Ein Muster gilt ab drei
   * Beobachtungen als gesichert. Ein Wochen- oder Monatsrückblick sieht Fotos,
   * die als Tage längst ausgewertet wurden – speiste er sie erneut ein,
   * bestätigte sich jede Beobachtung ein zweites Mal, und "gesichert" wäre
   * nach anderthalb echten Beobachtungen erreicht.
   *
   * Bei "Damals" liegt es umgekehrt. Der nächtliche Lauf reicht sieben Tage
   * zurück; ein Tag von vor einem Jahr wurde nie ausgewertet. Seine Bilder
   * werden hier angesehen und beschrieben – sie danach wegzuwerfen hieße, die
   * Analyse zu bezahlen und das Ergebnis zu verbrennen. Ob der Tag schon
   * bekannt ist, verrät das Tagesbild: Es entsteht genau dann, wenn ein Tag
   * verarbeitet wurde.
   */
  let neuesWissen = zeitraum === 'tag'
  if (antwort && zeitraum === 'damals') {
    const { count } = await admin.from('cat_day_summaries')
      .select('tag', { count: 'exact', head: true }).eq('tag', tag)
    neuesWissen = (count ?? 0) === 0
    if (!neuesWissen) console.log(`Gedächtnis: ${tag} war schon ausgewertet`)
  }

  // Getrennt abgesichert: Ein Fehler hier darf den fertigen Gedanken nicht kosten.
  if (antwort && neuesWissen) {
    try {
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
   * Die Bildnummer aus der Antwort auf das Foto, das das Modell unter dieser
   * Nummer gesehen hat.
   *
   * Ohne Nummer oder mit einer, die es nicht gibt, kommt nichts zurück. Früher
   * fiel das auf das erste Bild zurück, und das erzeugte lautlos genau den
   * Fehler, den es verstecken sollte: einen Satz unter einem Foto, über das er
   * nicht geschrieben wurde.
   */
  const bildFuer = (nummer: number | null): Bildquelle | null => {
    if (nummer === null || nummer < 1) return null
    return geladen[nummer - 1]?.quelle ?? null
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

    /**
     * Woraus der Hauptsatz gewählt wird.
     *
     * Beim Tagesfenster aus allem: Dort ist der Hauptsatz derselbe wie der
     * beste Bildsatz, und die Karte zeigt ihn neben seinem Foto.
     *
     * Bei einem Rückblick nicht. Dort ist der Hauptsatz das Fazit über den
     * ganzen Zeitraum, und das Modell liefert es ausdrücklich ohne Bildnummer.
     * Käme hier ein Satz über ein einzelnes Foto nach oben, wäre der Rückblick
     * wieder ein Tagesbericht – und genau das soll er nicht sein.
     */
    const fazitKandidaten = zeitraum === 'tag'
      ? vorschlaege
      : vorschlaege.filter(v => v.bild === null)
    const fuersFazit = fazitKandidaten.length > 0 ? fazitKandidaten : vorschlaege

    const gewaehlt = fuersFazit.length > 0
      ? waehleBesten(fuersFazit, {
          anker,
          letzteSaetze,
          letztePremissen,
          zielLaenge: zielLaenge[s],
          sprecher: sprecherVon[s],
        })
      : null

    if (fuersFazit.length > 0 && !gewaehlt) {
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
    // Für das Kopfbild der Karte ist ein Rückfall vertretbar: Dort steht der
    // Satz über der Karte, nicht neben dem Bild.
    const foto = bildFuer(gewaehlt?.kandidat.bild ?? null) ?? geladen[0]?.quelle ?? null

    /**
     * Je Bild der beste Satz.
     *
     * Bisher wurde der Gewinner behalten und der Rest weggeworfen. Seit die
     * Karte alle Fotos des Tages zeigt, ist das falsch: Der Text gehörte zu
     * einem Bild, angezeigt wurde er zu jedem. Wer das dritte Foto antippt und
     * den Kommentar zum ersten liest, hält die App zu Recht für kaputt.
     *
     * Also je Bildnummer den besten Vorschlag behalten. Ein Bild ohne
     * brauchbaren Satz bekommt keinen – lieber kein Kommentar als ein
     * fremder.
     */
    /**
     * Steht auf diesem Bild nur die sprechende Katze?
     *
     * Dann ist "er" oder "sie" darin falsch, gemeint sein kann nur sie selbst.
     * Nur bei eindeutiger Lage: Sind beide zu sehen oder hat das Modell nichts
     * erkannt, wird nichts verlangt – eine Ablehnung zu viel kostet dem Bild
     * seinen Satz.
     */
    const nurIchSelbst = (fotoId: string) => {
      const eigen = sprecherVon[s]?.toLowerCase()
      if (!eigen) return false
      const wer = gesehenAuf.get(fotoId)
      return wer !== undefined && wer.size === 1 && wer.has(eigen)
    }

    const proBild = new Map<string, { text: string; premisse: string | null; punkte: number }>()
    for (const v of vorschlaege) {
      const b = bildFuer(v.bild)
      if (!b) continue
      const bewertung = bewerte(v, {
        anker, letzteSaetze, letztePremissen,
        zielLaenge: zielLaenge[s], sprecher: sprecherVon[s],
        verlangtIchForm: nurIchSelbst(b.id),
      })
      if (bewertung.abgelehnt !== null) continue
      const bisher = proBild.get(b.id)
      if (!bisher || bewertung.punkte > bisher.punkte) {
        proBild.set(b.id, { text: v.text, premisse: v.premisse, punkte: bewertung.punkte })
      }
    }

    const bildZeilen = geladen
      .map(g => g.quelle)
      .filter(b => proBild.has(b.id))
      .map(b => ({
        fotoId: b.id,
        fotoUrl: b.url,
        fotoThumb: b.kachel,
        // Damit die Karte weiss, ob sie das Bild unverändert ausliefern darf.
        abgeleitet: b.abgeleitet,
        text: proBild.get(b.id)!.text,
        premise: proBild.get(b.id)!.premisse,
        // Bei einem Rückblick steht über dem Bild, von wann es ist. Ohne das
        // sind fünf Stationen einer Woche fünf beliebige Fotos.
        datum: bildDatum.get(b.id) ?? null,
      }))

    return {
      tag, zeitraum, stimme: s,
      text,
      zeilen: bildZeilen,
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
  await admin.from('cat_thoughts').upsert(zeilen, { onConflict: 'tag,zeitraum,stimme' })

  return alsAntwort(fenster, quelle, zeilen)
}

/** Die Form, in der eine Karte über die Schnittstelle geht. */
export type Karte = {
  zeitraum: Zeitraum
  tag: string
  titel: string
  quelle: string
  gedanken: Record<string, {
    text: string
    foto: string | null
    fotoId: string | null
    zeilen: unknown
  }>
}

export function alsAntwort(
  fenster: Fenster,
  quelle: string,
  zeilen: { stimme: string; text: string; foto_url: string | null; foto_id: string | null; zeilen: unknown }[],
): Karte {
  return {
    zeitraum: fenster.zeitraum,
    tag: fenster.tag,
    titel: fenster.titel,
    quelle,
    gedanken: Object.fromEntries(
      zeilen.map(z => [z.stimme, {
        text: z.text, foto: z.foto_url, fotoId: z.foto_id, zeilen: z.zeilen ?? [],
      }]),
    ),
  }
}

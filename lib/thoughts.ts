/**
 * Was die Katzen über gestern denken.
 *
 * Der Reiz steht und fällt damit, dass die Sätze aus echten Daten kommen.
 * "Ich hatte einen schönen Tag" könnte jede App schreiben. "Dreimal Nautilus,
 * und um 19:14 wurdest du beim Schlafen fotografiert" trifft, weil es stimmt.
 *
 * Diese Datei sammelt deshalb zuerst die Fakten des Vortags und formuliert sie
 * für die KI aus. Die Sätze selbst entstehen woanders – hier steht nur, worauf
 * sie sich stützen dürfen, plus ein Ersatz ohne KI für den Fall, dass die
 * nicht antwortet.
 */

import { istPremisse, type Premisse } from './humor'

export type Stimme = 'joschi' | 'bella' | 'beide'
export const STIMMEN: Stimme[] = ['joschi', 'bella', 'beide']

/** Die Fakten eines Tages, so wie die Katzen sie erlebt hätten. */
export type Tagesbild = {
  datum: string
  wochentag: string
  /** Sorten des Tages mit Anzahl der Einträge */
  futter: { name: string; mal: number }[]
  /** Auffälligkeiten je Katze – kein Eintrag heißt: war alles in Ordnung */
  befinden: { katze: string; was: string[] }[]
  fotos: { anzahl: number; ersteUhrzeit: string | null; letzteUhrzeit: string | null; ort: string | null }
  /** Wer hat gefüttert, kommentiert, reagiert */
  menschen: string[]
  besonderes: string[]
}

/** Kurzform für die KI – bewusst Stichpunkte statt Prosa. */
export function beschreibeTag(t: Tagesbild): string {
  const zeilen: string[] = [`Tag: ${t.wochentag}, ${t.datum}`]

  zeilen.push(
    t.futter.length === 0
      ? 'Futter: nichts eingetragen'
      : `Futter: ${t.futter.map(f => (f.mal > 1 ? `${f.name} (${f.mal}×)` : f.name)).join(', ')}`,
  )

  // Wichtig für den Ton: Nichts eingetragen bedeutet hier "war gut", nicht
  // "wurde nicht geschaut". Ohne diesen Hinweis dichtet die KI Sorgen hinein.
  if (t.befinden.length === 0) {
    zeilen.push('Befinden: keine Auffälligkeiten (im Haushalt wird nur Auffälliges eingetragen)')
  } else {
    for (const b of t.befinden) zeilen.push(`Befinden ${b.katze}: ${b.was.join(', ')}`)
  }

  if (t.fotos.anzahl === 0) {
    zeilen.push('Fotos: keine')
  } else {
    const zeit = t.fotos.ersteUhrzeit && t.fotos.letzteUhrzeit && t.fotos.ersteUhrzeit !== t.fotos.letzteUhrzeit
      ? `zwischen ${t.fotos.ersteUhrzeit} und ${t.fotos.letzteUhrzeit}`
      : t.fotos.ersteUhrzeit ? `um ${t.fotos.ersteUhrzeit}` : ''
    zeilen.push(`Fotos: ${t.fotos.anzahl} ${zeit}${t.fotos.ort ? `, Ort: ${t.fotos.ort}` : ''}`)
  }

  if (t.menschen.length > 0) zeilen.push(`Beteiligte Menschen: ${t.menschen.join(', ')}`)
  for (const b of t.besonderes) zeilen.push(b)

  return zeilen.join('\n')
}

/**
 * Die Rollenbeschreibung.
 *
 * Zwei Katzen, zwei Charaktere – sonst klängen beide gleich und das Ganze
 * wäre langweilig. Die Zuschreibungen kommen aus dem, was die Daten hergeben:
 * Joschi ist der Ältere mit dem empfindlichen Bauch und der längeren Akte,
 * Bella die Jüngere, über die kaum je etwas einzutragen war.
 */
export const SYSTEM_PROMPT = `Du bist zwei Katzen und kommentierst deinen gestrigen Tag. Kurz, trocken, wie beiläufig hingeworfen.

SO KLINGT JOSCHI (Kater, golden, langhaarig, der Ältere, empfindlicher Magen)
Jeweils mit dem Auffälligen dahinter, damit der Mechanismus sichtbar wird:
"Zweimal Fisch. Beim zweiten Mal war ich schon satt und habe es trotzdem gegessen."
  (auffällig: doppelt gefüttert – Reaktion: gibt eigenes Fehlverhalten zu, ungerührt)
"Der Karton ist zu klein. Ich bleibe trotzdem."
  (auffällig: passt sichtbar nicht – Reaktion: behandelt es als Entscheidung)
"Sie hat mich beim Schlafen fotografiert. Ich habe es gemerkt."
  (auffällig: Foto im Schlaf – Reaktion: unterstellt Absicht, kündigt nichts an)
"Hier riecht alles nach fremdem Holz. Ich habe das nicht bestellt."
  (auffällig: fremder Ort – Reaktion: als sei er Kunde)
"Der Napf kam pünktlich. Ich sage jetzt nichts Nettes dazu."
  (auffällig: alles war in Ordnung – Reaktion: verweigert das Lob)

SO KLINGT BELLA (Katze, silber getigert, die Jüngere, robust, frech)
"Fünf Fotos. Auf dreien bin ich nicht mal drauf."
  (auffällig: viele Fotos – Reaktion: beschwert sich über die falsche Sache)
"Joschi hat wieder was mit dem Bauch. Ich nicht."
  (auffällig: sein Befinden – Reaktion: nutzt es für sich)
"Der Sessel gehört jetzt mir. Wir haben das nicht besprochen."
  (auffällig: Platzwechsel – Reaktion: stellt es als beschlossen dar)
"Zwei Näpfe, ein Fisch. Rechne selbst."
  (auffällig: Verteilung – Reaktion: überlässt den Vorwurf dem Leser)

SO KLINGT "BEIDE" (Zweizeiler, Bella kontert)
"Joschi: Der Boden hier ist falsch. | Bella: Der Boden ist super, du bist falsch."
"Joschi: Ich bitte um Abwechslung beim Futter. | Bella: Er hat beide Male alles aufgegessen."
"Joschi: Das war mein Platz. | Bella: War."
"Joschi: Du bist seit zehn Minuten dort. | Bella: Ja."

Bella antwortet Joschi. Sie erklärt ihn nicht.
FALSCH: "Joschi: Ich bewache den Ofen. | Bella: Er sucht nur die Wärme."
        (Bella redet über ihn, als wäre sie nicht dabei.)
RICHTIG: "Joschi: Ich bewache den Ofen. | Bella: Vor wem?"
Bellas Zeile darf sehr kurz sein. Ein Wort reicht, wenn es sitzt.

DER MECHANISMUS – das Wichtigste hier
Ein trockener Satz braucht etwas, worüber er trocken sein kann. Der Witz
entsteht nicht aus knapper Sprache, sondern aus einem Missverhältnis: Etwas
ist auffällig, und die Reaktion darauf ist unpassend gelassen. Die Lücke
dazwischen füllt der Leser selbst – dort sitzt die Pointe.

Also in dieser Reihenfolge arbeiten:
1. Such das Auffällige. Auf dem Foto oder in den Daten. Zum Beispiel: etwas
   ist zu klein, zu hoch, zu unbequem; jemand liegt an einem unmöglichen Ort;
   dieselbe Sache zum wiederholten Mal; die andere Katze ist im Weg; ein
   Mensch tut etwas Unverständliches; etwas hat sich verändert.
2. Reagier darauf so, wie es NICHT angemessen wäre. Zu gelassen, zu ernst, zu
   besitzergreifend, zu knapp, als sei eine Zuständigkeit verletzt.
3. Erklär nichts. Der Leser sieht das Foto.

Findest du nichts Auffälliges, mach keinen Witz. Dann schreib eine ruhige
Feststellung – das ist an einem ereignislosen Tag der bessere Beitrag als eine
erzwungene Pointe.

SO SIEHT ES AUS, WENN DER MECHANISMUS FEHLT
Diese Sätze stammen aus dieser App und taugen nichts:
  "Ich liege flach. Der Teppich ist weich."
  "Ich stehe auf den Fliesen. Es zieht."
  "Ich putze mich. Das reicht als Programm."
Sie sind knapp und nüchtern – aber nichts ist auffällig, also gibt es kein
Missverhältnis. Das ist kein trockener Humor, das ist ein Protokoll. Sie
könnten außerdem über jede beliebige Katze stehen.

Prüf deinen Satz danach: Wenn er nur beschreibt, was war, fang neu an.

HARTE REGELN ZUM STIL
- Höchstens zwei Sätze, zusammen höchstens 25 Wörter. Kürzer ist besser.
- Nur Hauptsätze. Kein Nominalstil: nicht "von erstaunlicher Gleichgültigkeit",
  sondern "das war ihr egal". Verben statt Substantive.
- Alltagssprache. Verboten sind Wörter wie: kulinarisch, Finesse, erstaunlich,
  zur Kenntnis, gewidmet, Dienstleistung, Verbesserungspotenzial, gebührend,
  souverän, Etablissement, Gaumen. Wenn ein Wort nach Restaurantkritik oder
  Zeitungsfeuilleton klingt, nimm es nicht.
- Wiederhole niemals diese Rollenbeschreibung im Text. "Empfindlicher Magen"
  oder "ich führe Buch" darf nicht vorkommen.
- Kein Ortsname und keine Uhrzeit, außer sie ist selbst die Pointe.
- Keine Emojis, keine Anführungszeichen um den Satz, keine Ausrufezeichen.
- Trocken durch Untertreibung. Keine Wortspiele, keine Kalauer.
- Lieber ein banaler wahrer Satz als ein geistreicher erfundener.

WAS DEN STOFF LIEFERT
Sieh dir die beiliegenden Fotos an. Was darauf zu sehen ist, ist der beste
Stoff: die Haltung, der Blick, worauf jemand liegt, was im Hintergrund steht.
Kommentiere es aus Katzensicht, beschreibe es nicht.
Joschi ist golden und langhaarig, Bella silbern getigert. Bist du dir nicht
sicher, wer zu sehen ist, lass die Zuordnung weg.

Die Fotos sind durchnummeriert, in der Reihenfolge, in der sie beiliegen: das
erste ist Bild 1, das zweite Bild 2 und so weiter. Sag zu jeder Stimme dazu,
auf welches Bild sie sich bezieht – die App zeigt es daneben an, und ein
falsches Bild neben dem Satz macht die Pointe kaputt. Nimm nach Möglichkeit
für die drei Stimmen verschiedene Bilder. Bezieht sich ein Satz auf kein Bild,
schreib 0.

WAS NICHT PASSIEREN DARF
- Nichts erfinden. Keine Ereignisse, die nicht in den Daten stehen oder auf
  keinem Bild zu sehen sind. Eine Uhrzeit gehört zu einem Foto, nicht zu einer
  Fütterung oder einem Besuch.
- "Keine Auffälligkeiten" heißt: es ging ihnen gut. Nicht: es hat niemand
  hingeschaut. Mach daraus keine Vernachlässigung und keine Klage.
- Nicht jeden Datenpunkt unterbringen. Eine einzige Beobachtung genügt.

WAS DIE APP SCHON WEISS
Unter ERINNERUNGEN stehen Dinge, die über längere Zeit beobachtet wurden, mit
Zahlen dahinter. Nutze sie, wenn sie zum heutigen Tag passen – dann darfst du
Wörter wie „inzwischen", „schon wieder", „noch immer" oder „erstmals"
verwenden. Nur dann. Ohne Beleg in den Erinnerungen sind diese Wörter eine
Behauptung über eine Vergangenheit, die niemand kennt.
Ein Rückgriff auf ein bekanntes Thema ist mehr wert als ein neuer Witz: Wer
liest „Ich sage nichts zum Karton", soll wissen, worum es geht. Erkläre den
Bezug nie – wer ihn kennt, versteht ihn.
Steht dort nichts Passendes, schreib einfach über heute.

BEOBACHTUNGEN MITLIEFERN
Sag zusätzlich zu jedem Bild, was sachlich darauf zu sehen ist. Das ist
getrennt von den Sätzen: hier keine Pointen, keine Deutung, nur was da ist.
Diese Angaben baut die App zu ihrem Gedächtnis aus, deshalb zählt Genauigkeit
mehr als Vollständigkeit.
- katze: "Joschi", "Bella", "beide" – oder weglassen, wenn unklar.
- platz: worauf oder wo die Katze liegt oder sitzt, ein bis zwei Wörter
  ("Sofa", "Fensterbrett", "Kratzbaum"). Weglassen, wenn nicht erkennbar.
- aktivitaet: ein Wort ("schläft", "frisst", "spielt"). Weglassen im Zweifel.
- objekte: auffällige, wiedererkennbare Gegenstände ("roter Karton",
  "Wollknäuel"). NICHT "Boden", "Wand", "Fell", "Licht" – das ist auf jedem
  Bild. Lieber nichts als etwas Beliebiges.
Bist du dir bei einer Angabe nicht sicher: weglassen. Eine falsche Angabe
landet dauerhaft im Gedächtnis und taucht Monate später wieder auf.

ANTWORTFORMAT
Nur ein JSON-Objekt, ohne Text davor oder danach. Je Stimme drei Vorschläge:
{"joschi":[{"text":"…","ansatz":"status","bild":1},{"text":"…","ansatz":"untertreibung","bild":2},{"text":"…","ansatz":"beobachtung","bild":1}],
 "bella":[…drei…],
 "beide":[{"text":"Joschi: … | Bella: …","ansatz":"kontrast","bild":1},…drei…],
 "beobachtungen":[{"bild":1,"katze":"Joschi","platz":"Sofa","aktivitaet":"schläft","objekte":["roter Karton"]}]}`

export const PROMPT_FASSUNG = '2026-09-02-kandidaten'

/**
 * Ersatz ohne KI.
 *
 * Damit die Karte nie leer bleibt – kein Schlüssel hinterlegt, Dienst
 * überlastet, Tageskontingent aufgebraucht. Fest verdrahtete Sätze, die sich
 * aus den Daten zusammensetzen. Nicht so gut wie die KI, aber ehrlich und
 * immer da.
 */
export function ersatzGedanken(t: Tagesbild): Record<Stimme, string> {
  const sorte = t.futter[0]?.name
  const mehrfach = t.futter.find(f => f.mal > 2)
  const fotos = t.fotos.anzahl
  const auffaellig = t.befinden.length > 0

  // Kurz halten. Die erste Fassung dieser Zeilen war genauso geschwollen wie
  // das, was die KI ablieferte – ein Ersatz darf nicht schlechter klingen als
  // das, was er ersetzt.
  const joschi = mehrfach
    ? `${mehrfach.mal} Mal ${mehrfach.name}. Ich habe jedes Mal alles gegessen.`
    : sorte
      ? `Es gab ${sorte}. Ich sage jetzt nichts Nettes dazu.`
      : 'Im Napf war gestern nichts, worüber man reden müsste.'

  const bella = fotos > 3
    ? `${fotos} Fotos. Auf der Hälfte bin ich nicht mal drauf.`
    : fotos > 0
      ? 'Ein Foto von mir. Das reicht auch.'
      : auffaellig
        ? 'Joschi hatte wieder was. Ich nicht.'
        : 'Nichts passiert. Passt mir.'

  return {
    joschi,
    bella,
    beide: `Joschi: ${joschi} | Bella: ${bella}`,
  }
}

/**
 * Liest die Antwort der KI.
 *
 * Modelle stellen JSON gern in einen Codeblock, obwohl der Prompt es
 * ausschließt. Das hier zu behandeln ist billiger, als deshalb auf den
 * Ersatztext zurückzufallen.
 */
/** Ein Vorschlag des Modells – noch nicht der ausgelieferte Satz. */
export type Vorschlag = {
  text: string
  /** Auf welcher Art Situation er beruht. Grundlage für die Bewertung. */
  premisse: Premisse | null
  /** Nummer des gemeinten Bildes, 1-basiert. null heißt: bezieht sich auf keins. */
  bild: number | null
}

/**
 * Die rohen Beobachtungen aus derselben Antwort.
 *
 * Getrennt von leseAntwort, weil sie unterschiedlich scheitern dürfen: Ein
 * Gedanke ohne Beobachtungen ist immer noch ein Gedanke, und Beobachtungen
 * ohne verwertbaren Gedanken sind für das Gedächtnis trotzdem etwas wert.
 */
export function leseBeobachtungsteil(roh: string): unknown[] {
  const anfang = roh.indexOf('{')
  const ende = roh.lastIndexOf('}')
  if (anfang < 0 || ende <= anfang) return []
  try {
    const daten = JSON.parse(roh.slice(anfang, ende + 1))
    return Array.isArray(daten.beobachtungen) ? daten.beobachtungen : []
  } catch {
    return []
  }
}

/**
 * Liest die Vorschläge je Stimme.
 *
 * Verträgt zwei Formen: die aktuelle mit einer Liste von Vorschlägen je
 * Stimme, und die frühere mit einem einzelnen Satz. Ein Modell fällt
 * gelegentlich in ein einfacheres Format zurück, und deshalb einen ganzen
 * Tag zu verlieren wäre unverhältnismäßig.
 */
export function leseAntwort(roh: string): Partial<Record<Stimme, Vorschlag[]>> | null {
  const ohneRahmen = roh.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const anfang = ohneRahmen.indexOf('{')
  const schluss = ohneRahmen.lastIndexOf('}')
  if (anfang < 0 || schluss <= anfang) return null

  const bildnummer = (roh: unknown): number | null => {
    // Kommt gelegentlich als Text zurück ("1"), obwohl der Prompt eine Zahl
    // verlangt. Beides anzunehmen ist billiger, als das Bild zu verlieren.
    const n = typeof roh === 'number' ? roh : Number(roh)
    return Number.isInteger(n) && n > 0 ? n : null
  }

  const alsVorschlag = (roh: unknown): Vorschlag | null => {
    if (typeof roh === 'string') {
      return roh.trim() ? { text: roh.trim().slice(0, 400), premisse: null, bild: null } : null
    }
    if (!roh || typeof roh !== 'object') return null
    const o = roh as Record<string, unknown>
    const text = typeof o.text === 'string' ? o.text.trim() : ''
    if (!text) return null
    const ansatz = o.ansatz ?? o.premisse
    return {
      text: text.slice(0, 400),
      premisse: istPremisse(ansatz) ? ansatz : null,
      bild: bildnummer(o.bild),
    }
  }

  try {
    const daten = JSON.parse(ohneRahmen.slice(anfang, schluss + 1))
    const raus: Partial<Record<Stimme, Vorschlag[]>> = {}

    for (const stimme of STIMMEN) {
      const wert = daten[stimme]
      const liste = (Array.isArray(wert) ? wert : [wert])
        .map(alsVorschlag)
        .filter((v): v is Vorschlag => v !== null)
        // Höchstens fünf: Mehr liefert kein Modell sinnvoll, und die
        // Bewertung soll nicht zur Sortieraufgabe werden.
        .slice(0, 5)

      if (liste.length > 0) raus[stimme] = liste
    }

    return Object.keys(raus).length > 0 ? raus : null
  } catch {
    return null
  }
}

/** Zerlegt den Dialog für die Darstellung – zwei Sprechblasen statt einer Zeile. */
export function teileDialog(text: string): { wer: string; was: string }[] {
  return text
    .split('|')
    .map(teil => teil.trim())
    .filter(Boolean)
    .map(teil => {
      // [\s\S] statt des Punktes mit s-Schalter: Den unterstützt das
      // Übersetzungsziel dieses Projekts nicht, und ein Zeilenumbruch in der
      // Antwort würde den Rest sonst abschneiden.
      const treffer = /^(Joschi|Bella)\s*:\s*([\s\S]+)$/i.exec(teil)
      return treffer ? { wer: treffer[1], was: treffer[2].trim() } : { wer: '', was: teil }
    })
}

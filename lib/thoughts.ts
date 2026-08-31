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
"Zweimal Fisch. Beim zweiten Mal war ich schon satt und habe es trotzdem gegessen."
"Ich lag den ganzen Tag auf dem Teppich. War so geplant."
"Der Napf kam pünktlich. Ich sage jetzt nichts Nettes dazu."
"Hier riecht alles nach fremdem Holz. Ich habe das nicht bestellt."
"Sie hat mich beim Schlafen fotografiert. Ich habe es gemerkt."

SO KLINGT BELLA (Katze, silber getigert, die Jüngere, robust, frech)
"Fünf Fotos. Auf dreien bin ich nicht mal drauf."
"Joschi hat wieder was mit dem Bauch. Ich nicht."
"Ich lag flach auf dem Boden. Absicht."
"Der Sessel gehört jetzt mir. Wir haben das nicht besprochen."
"Zwei Näpfe, ein Fisch. Rechne selbst."

SO KLINGT "BEIDE" (Zweizeiler, Bella kontert)
"Joschi: Der Boden hier ist falsch. | Bella: Der Boden ist super, du bist falsch."
"Joschi: Ich bitte um Abwechslung beim Futter. | Bella: Er hat beide Male alles aufgegessen."
"Joschi: Ich habe mich heute zurückgezogen. | Bella: Er hat geschlafen."

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

ANTWORTFORMAT
Nur ein JSON-Objekt, ohne Text davor oder danach. Die Bildnummern sind Zahlen:
{"joschi":"…","joschi_bild":1,"bella":"…","bella_bild":2,"beide":"Joschi: … | Bella: …","beide_bild":1}`

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
export type Gedanke = {
  text: string
  /** Nummer des gemeinten Bildes, 1-basiert. null heißt: bezieht sich auf keins. */
  bild: number | null
}

export function leseAntwort(roh: string): Partial<Record<Stimme, Gedanke>> | null {
  const ohneRahmen = roh.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const anfang = ohneRahmen.indexOf('{')
  const ende = ohneRahmen.lastIndexOf('}')
  if (anfang < 0 || ende <= anfang) return null

  try {
    const daten = JSON.parse(ohneRahmen.slice(anfang, ende + 1))
    const raus: Partial<Record<Stimme, Gedanke>> = {}
    for (const stimme of STIMMEN) {
      const wert = daten[stimme]
      if (typeof wert !== 'string' || !wert.trim()) continue

      // Die Bildnummer kommt gelegentlich als Text zurück ("1"), obwohl der
      // Prompt eine Zahl verlangt. Beides annehmen ist billiger, als deshalb
      // das passende Bild zu verlieren.
      const roheNummer = daten[`${stimme}_bild`]
      const nummer = typeof roheNummer === 'number' ? roheNummer : Number(roheNummer)

      raus[stimme] = {
        text: wert.trim().slice(0, 400),
        bild: Number.isInteger(nummer) && nummer > 0 ? nummer : null,
      }
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

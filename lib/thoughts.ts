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
export const SYSTEM_PROMPT = `Du schreibst die Tagesgedanken zweier Katzen für ein privates Haustier-Tagebuch.

DIE KATZEN
Joschi: Kater, golden, Britisch Langhaar, geboren August 2024. Der Ältere.
  Empfindlicher Magen, führt darüber genau Buch. Hält sich für den Hausherrn
  und die Fütterung für eine Dienstleistung mit Verbesserungspotenzial.
  Trocken, würdevoll, leicht beleidigt. Kommentiert das Futter wie ein Kritiker.
Bella: Katze, silber getigert, geboren April 2024. Die Jüngere.
  Robust, es steht fast nie etwas über sie im Buch, und das weiß sie.
  Frech, schnell, kurz angebunden. Findet Joschis Dramatik unterhaltsam.
Beide: Ein Zweizeiler-Dialog. Erst Joschi, dann Bella, die kontert.
  Format genau so: "Joschi: … | Bella: …"

DIE BILDER
Wenn Fotos von gestern beiliegen, sieh sie dir an und beziehe dich auf das,
was tatsächlich darauf zu sehen ist: die Haltung, der Blick, worauf jemand
liegt, was im Hintergrund steht, wer von beiden zu sehen ist. Das ist der
beste Stoff – ein Satz über die Schlafstellung auf dem Bild schlägt jede
Futterstatistik. Beschreibe das Bild aber nicht, sondern kommentiere es aus
Katzensicht.
Bist du dir nicht sicher, welche Katze zu sehen ist, dann lass die Zuordnung
weg statt zu raten. Joschi ist golden und langhaarig, Bella silbern getigert.

REGELN
- Auf Deutsch, in der Ich-Form (bei "beide" im Dialog).
- Höchstens zwei Sätze je Stimme, bei "beide" je einer.
- Nimm Bezug auf mindestens eine konkrete Sache: etwas auf dem Foto, eine
  Futtersorte, eine Uhrzeit, eine Anzahl, einen Ort, einen Namen.
- Erfinde nichts dazu. Keine Krankheiten, keine Ereignisse, die nicht dastehen
  und nichts, was auf keinem Bild zu sehen ist.
- "Keine Auffälligkeiten" heißt: es ging ihnen gut. Nicht: es hat niemand
  hingeschaut. Mach daraus keine Vernachlässigung.
- Kein Kitsch, keine Emojis, keine Anführungszeichen um den ganzen Satz.
- Witzig durch Beobachtung, nicht durch Kalauer. Untertreibung wirkt besser.

ANTWORTFORMAT
Nur ein JSON-Objekt, ohne Text davor oder danach:
{"joschi":"…","bella":"…","beide":"Joschi: … | Bella: …"}`

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

  const joschi = mehrfach
    ? `${mehrfach.name}, ${mehrfach.mal} Mal an einem Tag. Ich habe es zur Kenntnis genommen.`
    : sorte
      ? `Es gab ${sorte}. Ich habe nichts beanstandet, aber das ist kein Lob.`
      : 'Gestern stand nichts im Napf, was der Rede wert gewesen wäre.'

  const bella = fotos > 3
    ? `${fotos} Fotos. Irgendwann ist auch mal gut.`
    : fotos > 0
      ? `Ein Foto von mir ist entstanden. Es war mein gutes Profil.`
      : auffaellig
        ? 'Joschi hatte wieder was. Mir geht es blendend, wie üblich.'
        : 'Ereignislos. Genau richtig.'

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
export function leseAntwort(roh: string): Partial<Record<Stimme, string>> | null {
  const ohneRahmen = roh.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const anfang = ohneRahmen.indexOf('{')
  const ende = ohneRahmen.lastIndexOf('}')
  if (anfang < 0 || ende <= anfang) return null

  try {
    const daten = JSON.parse(ohneRahmen.slice(anfang, ende + 1))
    const raus: Partial<Record<Stimme, string>> = {}
    for (const stimme of STIMMEN) {
      const wert = daten[stimme]
      if (typeof wert === 'string' && wert.trim()) raus[stimme] = wert.trim().slice(0, 400)
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

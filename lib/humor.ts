/**
 * Die Humor-Auswahl.
 *
 * Der Weg hierher in zwei Schritten, beide lehrreich:
 *
 * Zuerst fehlte der Mechanismus. Die Anweisung verlangte kurze Sätze ohne
 * Kalauer – die Oberfläche von Trockenheit. Heraus kamen Protokolle wie
 * "Ich liege flach. Der Teppich ist weich.": knapp, nüchtern, ohne dass
 * irgendetwas auffällig gewesen wäre.
 *
 * Dann kam eine feste Technik je Kalendertag. Das brachte Abwechslung, aber
 * am falschen Ende: Der Kalender entschied, worüber gewitzelt wird, nicht der
 * Tag. An einem Tag, an dem Bella auf Joschis Platz lag, konnte "Über die
 * Menschen" dran sein – und die eigentliche Situation blieb liegen.
 *
 * Jetzt gilt: Die Situation entscheidet zuerst. Das Modell schlägt mehrere
 * Ansätze vor, jeder mit der Situation, auf der er beruht. Bewertet und
 * ausgewählt wird hier – deterministisch, nachvollziehbar und prüfbar.
 */

/** Die Ansatzarten. Keine Reihenfolge, keine Rotation – eine Auswahl. */
export const PREMISSEN = [
  'untertreibung',
  'status',
  'nichtreaktion',
  'kontrast',
  'rueckgriff',
  'menschen',
  'absurd',
  'beobachtung',
] as const

export type Premisse = (typeof PREMISSEN)[number]

export function istPremisse(wert: unknown): wert is Premisse {
  return typeof wert === 'string' && (PREMISSEN as readonly string[]).includes(wert)
}

export type Kandidat = {
  text: string
  premisse: Premisse | null
  bild: number | null
}

/**
 * Sprache, die hier nichts zu suchen hat.
 *
 * Als Prüfung und nicht nur als Bitte im Prompt: Eine Anweisung wird
 * gelegentlich ignoriert, eine Ablehnung nie. "Fellnase" darf nicht einmal
 * versehentlich durchrutschen.
 */
export const VERBOTEN = [
  'miau', 'fellnase', 'flauschkugel', 'dosenöffner', 'dosenoeffner',
  'pfötchen', 'pfoetchen', 'samtpfote', 'stubentiger', 'schmusekatze',
  'kleine königin', 'kleiner könig', 'königin der', 'könig der',
  'sooo', 'soooo', 'omg', 'haha', 'hihi', 'lol',
  'typisch katze', 'typisch katzen', 'katzentypisch',
  'kuschelig', 'knuffig', 'putzig', 'herzallerliebst',
]

/** Enthält der Satz verbotene Sprache? Dann fliegt er raus, ohne Abwägung. */
export function verboteneSprache(text: string): string | null {
  const klein = text.toLowerCase()
  for (const wort of VERBOTEN) {
    if (klein.includes(wort)) return wort
  }
  // Emojis gehören nicht in die Gedanken – sie erklären die Pointe.
  if (/\p{Extended_Pictographic}/u.test(text)) return 'Emoji'
  // Ausrufezeichen sind das Gegenteil von trocken
  if (text.includes('!')) return 'Ausrufezeichen'
  return null
}

const FUELLWOERTER = new Set([
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'das', 'der', 'die', 'ein', 'eine',
  'und', 'ist', 'war', 'hat', 'den', 'dem', 'mit', 'auf', 'für', 'von', 'bin',
  'mir', 'mich', 'sich', 'nicht', 'auch', 'noch', 'schon', 'aber', 'als',
])

/**
 * Das Gerüst eines Satzes – seine Form, nicht sein Inhalt.
 *
 * Erfasst Satzanfang und Längenklassen. Genau das war bei
 * "Ich stehe auf den Fliesen. Es zieht." und
 * "Ich stehe auf dem Tisch. Das reicht als Plan." identisch, während sich die
 * Wörter unterschieden. Eine Wortprüfung findet solche Wiederholungen nie.
 */
export function satzGeruest(text: string): string {
  const saetze = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean)
  const anfang = (satz: string) =>
    satz.toLowerCase().replace(/[^a-zäöüß\s]/g, '').split(/\s+/).slice(0, 2).join(' ')
  const laenge = (satz: string) => {
    const n = satz.split(/\s+/).filter(Boolean).length
    return n <= 3 ? 'k' : n <= 7 ? 'm' : 'l'
  }
  return saetze.map(s => `${anfang(s)}/${laenge(s)}`).join('|')
}

export function gleicheForm(neu: string, letzte: string[]): boolean {
  const geruest = satzGeruest(neu)
  if (!geruest) return false
  const ersterTeil = geruest.split('|')[0]
  return letzte.some(alt => satzGeruest(alt).split('|')[0] === ersterTeil)
}

const woerterVon = (s: string) =>
  new Set(
    s.toLowerCase().replace(/[^a-zäöüß\s]/g, ' ').split(/\s+/).filter(w => w.length > 3),
  )

/** Sagt der Satz im Kern dasselbe wie einer der letzten? */
export function zuAehnlich(neu: string, letzte: string[], schwelle = 0.55): boolean {
  const a = woerterVon(neu)
  if (a.size === 0) return false
  for (const alt of letzte) {
    const b = woerterVon(alt)
    if (b.size === 0) continue
    let gemeinsam = 0
    for (const w of a) if (b.has(w)) gemeinsam++
    if (gemeinsam / Math.min(a.size, b.size) >= schwelle) return true
  }
  return false
}

/**
 * Trägt der Satz etwas, das nur auf diesen Haushalt zutrifft?
 *
 * Der Test aus der Vorgabe: Könnte er in jeder beliebigen Katzen-App stehen?
 * Anker sind Ortsnamen, Futtersorten, Namen, Mengen oder Wörter aus den
 * Erinnerungen.
 */
export function hatAnker(text: string, anker: string[]): boolean {
  const klein = text.toLowerCase()
  if (/\d/.test(klein)) return true
  if (/\b(einmal|zweimal|dreimal|viermal|fünfmal|beide|beiden)\b/.test(klein)) return true
  return anker.some(a => a.length >= 4 && klein.includes(a.toLowerCase()))
}

/** Die zuletzt verwendeten Satzanfänge, für die Anweisung an das Modell. */
export function letzteAnfaenge(saetze: string[], anzahl = 6): string[] {
  return Array.from(new Set(
    saetze
      .map(s => satzGeruest(s).split('|')[0].split('/')[0].trim())
      .filter(a => a && !FUELLWOERTER.has(a)),
  )).slice(0, anzahl)
}

const wortzahl = (t: string) => t.split(/\s+/).filter(Boolean).length

export type BewertungsKontext = {
  /** Ortsnamen, Futtersorten, Katzennamen, Erinnerungs-Stichworte von heute. */
  anker: string[]
  /** Die zuletzt geschriebenen Sätze, für Wort- und Formvergleich. */
  letzteSaetze: string[]
  /** Welche Ansatzarten zuletzt dran waren, jüngste zuerst. */
  letztePremissen: Premisse[]
  /** Für die Stimme typische Satzlänge – Bella ist knapper als Joschi. */
  zielLaenge: number
}

export type Bewertung = {
  punkte: number
  gruende: string[]
  abgelehnt: string | null
}

/**
 * Bewertet einen Kandidaten.
 *
 * Bewusst deterministisch: Ein Modell, das seine eigenen Vorschläge benotet,
 * benotet sie gut. Die Kriterien stammen aus der Vorgabe – Spezifität,
 * Neuheit, Rückgriffswert, Subtilität, Natürlichkeit, und die Abwertung von
 * Gemachtem und Generischem.
 */
export function bewerte(k: Kandidat, kontext: BewertungsKontext): Bewertung {
  const gruende: string[] = []

  // Harte Ablehnung: Verbotene Sprache wird nicht abgewogen.
  const verboten = verboteneSprache(k.text)
  if (verboten) {
    return { punkte: -Infinity, gruende: [], abgelehnt: `verbotene Sprache: ${verboten}` }
  }
  if (!k.text.trim()) {
    return { punkte: -Infinity, gruende: [], abgelehnt: 'leer' }
  }

  let punkte = 10

  // ── Spezifität ──────────────────────────────────────────────────────
  // Der wichtigste Posten. Ein Satz ohne Bezug zu diesem Haushalt könnte in
  // jeder Katzen-App stehen und ist damit wertlos, egal wie elegant er ist.
  if (hatAnker(k.text, kontext.anker)) {
    punkte += 6
    gruende.push('konkret')
  } else {
    punkte -= 5
    gruende.push('austauschbar')
  }

  // ── Rückgriff ───────────────────────────────────────────────────────
  // Ein Callback ist mehr wert als ein neuer Witz: Er funktioniert nur mit
  // der gemeinsamen Geschichte, und genau das ist der Unterschied zu einem
  // beliebigen Sprachmodell.
  if (k.premisse === 'rueckgriff') {
    punkte += 4
    gruende.push('Rückgriff')
  }

  // ── Neuheit gegenüber den letzten Tagen ─────────────────────────────
  if (zuAehnlich(k.text, kontext.letzteSaetze)) {
    punkte -= 8
    gruende.push('wörtlich zu nah an zuletzt')
  }
  if (gleicheForm(k.text, kontext.letzteSaetze)) {
    punkte -= 6
    gruende.push('gleiche Satzform wie zuletzt')
  }

  // Abwechslung entsteht hier – nicht über einen Kalender. Wer denselben
  // Ansatz zuletzt schon hatte, muss inhaltlich stärker sein, um zu gewinnen.
  if (k.premisse) {
    const stelle = kontext.letztePremissen.indexOf(k.premisse)
    if (stelle === 0) { punkte -= 5; gruende.push('Ansatz war gestern dran') }
    else if (stelle > 0 && stelle < 4) { punkte -= 2; gruende.push('Ansatz kürzlich dran') }
  } else {
    // Ohne benannte Situation ist unklar, worauf der Satz überhaupt beruht
    punkte -= 3
    gruende.push('ohne benannte Situation')
  }

  // ── Subtilität und Natürlichkeit ────────────────────────────────────
  const woerter = wortzahl(k.text)
  if (woerter > 25) { punkte -= 6; gruende.push('zu lang') }
  else if (woerter <= kontext.zielLaenge) { punkte += 2; gruende.push('knapp') }

  // Erklärte Pointen sind keine mehr
  if (/\b(das ist (jetzt )?(ironisch|witzig|lustig)|nur (ein )?spaß|im ernst jetzt)\b/i.test(k.text)) {
    punkte -= 6
    gruende.push('erklärt sich selbst')
  }

  // Nominalstil klang schon einmal nach Feuilleton statt nach Katze
  if (/\b(von (erstaunlicher|bemerkenswerter|gewisser)|zur kenntnis|kulinarisch|finesse)\b/i.test(k.text)) {
    punkte -= 5
    gruende.push('geschwollen')
  }

  return { punkte: Math.round(punkte * 10) / 10, gruende, abgelehnt: null }
}

/**
 * Wählt aus den Vorschlägen den besten.
 *
 * Gibt null zurück, wenn alle abgelehnt wurden – dann greift der Ersatz.
 * Lieber ein schlichter Satz aus fester Liste als einer mit "Fellnase" darin.
 */
export function waehleBesten(
  kandidaten: Kandidat[],
  kontext: BewertungsKontext,
): { kandidat: Kandidat; bewertung: Bewertung } | null {
  const bewertet = kandidaten
    .map(k => ({ kandidat: k, bewertung: bewerte(k, kontext) }))
    .filter(x => x.bewertung.abgelehnt === null)
    .sort((a, b) => b.bewertung.punkte - a.bewertung.punkte)

  return bewertet[0] ?? null
}

/**
 * Der Teil der Anweisung, der sich täglich ändert.
 *
 * Keine Technik-Vorgabe mehr. Stattdessen die Aufforderung, aus der Situation
 * heraus mehrere Ansätze zu liefern – und die Angabe, welche Satzanfänge und
 * Ansätze zuletzt dran waren, damit sie nicht direkt wiederholt werden.
 */
export function tagesAnweisung(letzteSaetze: string[], letztePremissen: Premisse[]): string {
  const teile = [
    'EIN VORSCHLAG JE BILD',
    'Gib zu jeder Stimme einen Vorschlag zu jedem beiliegenden Bild – bei vier',
    'Bildern also vier Vorschläge, jeder mit der passenden Bildnummer. Die App',
    'stellt jeden Satz neben sein Bild; ein Satz am falschen Bild macht die',
    'Karte kaputt.',
    'Sag zu einem Bild nichts, wenn es nichts hergibt. Lieber drei Sätze zu vier',
    'Bildern als ein erzwungener zum vierten.',
    'Und wiederhole dich nicht: Vier Bilder desselben Tages sollen vier',
    'Beobachtungen ergeben, nicht viermal dieselbe mit anderen Worten.',
    '',
    'Nenn zu jedem Vorschlag den Ansatz:',
    '  untertreibung  – etwas Auffälliges völlig nüchtern behandeln',
    '  status         – eine Banalität als Frage der Zuständigkeit behandeln',
    '  nichtreaktion  – auf etwas Absurdes gelangweilt reagieren',
    '  kontrast       – beide sehen dieselbe Sache unvereinbar',
    '  rueckgriff     – an etwas aus den Erinnerungen anknüpfen',
    '  menschen       – eine menschliche Routine aus Katzensicht kommentieren',
    '  absurd         – etwas Banales mit vollem Ernst behandeln',
    '  beobachtung    – nur feststellen, ohne Pointe',
    '',
    'Welcher Ansatz passt, entscheidet die Situation – nicht der Kalender.',
    'Passt an einem Tag nur ein einziger, dann liefere trotzdem drei',
    'Vorschläge dazu, aber verschieden formuliert.',
  ]

  const anfaenge = letzteAnfaenge(letzteSaetze)
  if (anfaenge.length > 0) {
    teile.push(
      '',
      `ZULETZT BENUTZTE SATZANFÄNGE: ${anfaenge.map(a => `„${a}…"`).join(', ')}`,
      'Fang anders an. Nicht wieder mit demselben Muster aus Ich + Verb + Ort.',
    )
  }

  if (letztePremissen.length > 0) {
    teile.push(
      `ZULETZT BENUTZTE ANSÄTZE: ${letztePremissen.slice(0, 4).join(', ')}`,
      'Diese sind nicht verboten, aber sie müssen inhaltlich stärker sein.',
    )
  }

  return teile.join('\n')
}

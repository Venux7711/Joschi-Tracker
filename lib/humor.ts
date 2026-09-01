/**
 * Damit nicht jeden Tag derselbe Witz in anderen Worten dasteht.
 *
 * Der Anlass war dieser Befund über zwei Tage:
 *
 *   "Ich stehe auf den Fliesen. Es zieht."
 *   "Ich stehe auf dem Tisch. Das reicht als Plan."
 *   "Ich putze mich. Das reicht als Programm."
 *   "Ich liege flach. Der Teppich ist weich."
 *
 * Fünf von sechs Sätzen in derselben Form: Ich + Verb + Ort, dann ein kurzer
 * Nachsatz. Die vorhandene Prüfung auf Wortüberschneidung findet das nicht –
 * "Plan" und "Programm" haben kein Wort gemeinsam, sind aber derselbe Witz.
 * Wiederholt wird die Struktur, nicht der Wortlaut.
 *
 * Zwei Gegenmittel, beide ohne Modellaufruf:
 *
 *   1. Jeder Tag bekommt eine Humortechnik vorgegeben. Das zwingt zur
 *      Abwechslung, statt zu hoffen, dass sie sich einstellt.
 *   2. Ein Gerüst je Satz macht Formgleichheit messbar und damit ablehnbar.
 */

export type Technik = {
  key: string
  name: string
  anweisung: string
  beispiel: string
}

/**
 * Die Techniken, zwischen denen gewechselt wird.
 *
 * Bewusst nicht alle "witzig": Ein ruhiger Beobachtungssatz ist an manchen
 * Tagen der bessere Beitrag, und ein erzwungener Gag an einem ereignislosen
 * Tag fällt immer auf.
 */
export const TECHNIKEN: Technik[] = [
  {
    key: 'untertreibung',
    name: 'Untertreibung',
    anweisung: 'Etwas offensichtlich Auffälliges möglichst nüchtern abtun.',
    beispiel: 'Foto: Katze auf winzigem Karton → "Passt."',
  },
  {
    key: 'status',
    name: 'Status',
    anweisung: 'Aus der Haltung heraus sprechen, als sei eine Zuständigkeit verletzt worden. Ohne Krone, ohne Boss.',
    beispiel: '"Das war nicht abgesprochen."',
  },
  {
    key: 'nichtreaktion',
    name: 'Nicht-Reaktion',
    anweisung: 'Auf etwas Auffälliges betont knapp und ohne Aufregung reagieren. Die Auslassung ist die Pointe.',
    beispiel: '"Interessant."',
  },
  {
    key: 'beobachtung',
    name: 'Trockene Beobachtung',
    anweisung: 'Nur feststellen, was war. Keine Pointe. Der Satz trägt sich selbst.',
    beispiel: '"Der Platz war fünf Minuten frei."',
  },
  {
    key: 'menschen',
    name: 'Über die Menschen',
    anweisung: 'Etwas kommentieren, das die Menschen getan haben, aus ganz eigener Prioritätensetzung.',
    beispiel: '"Sie räumt schon wieder auf."',
  },
  {
    key: 'ruecklick',
    name: 'Rückgriff',
    anweisung: 'An etwas anknüpfen, das in den Erinnerungen steht. Nur wenn dort etwas Passendes steht – sonst nimm eine andere Technik.',
    beispiel: '"Das Thema hatten wir bereits."',
  },
  {
    key: 'absurd',
    name: 'Absurde Ernsthaftigkeit',
    anweisung: 'Eine Belanglosigkeit mit vollem Ernst behandeln, als stünde eine Entscheidung an.',
    beispiel: '"Wir sollten über diesen Karton reden."',
  },
  {
    key: 'kontrast',
    name: 'Kontrast',
    anweisung: 'Dieselbe Sache aus zwei unvereinbaren Blickwinkeln. Besonders geeignet für den Dialog.',
    beispiel: 'Joschi: "Das war mein Platz." Bella: "War."',
  },
]

/**
 * Welche Technik gilt an diesem Tag?
 *
 * Aus dem Datum abgeleitet und dadurch stabil: Beim Neuladen kommt dieselbe
 * heraus, beim Würfeln auch. Für einen anderen Wurf gibt es den Versatz –
 * so lässt sich gezielt eine andere Richtung erzwingen, ohne dass die Wahl
 * zufällig und damit unwiederholbar würde.
 */
export function technikFuer(tag: string, versatz = 0): Technik {
  const zahl = Number(tag.replace(/-/g, '')) || 0
  // Ungerade Schrittweite: Sonst wiederholt sich die Reihenfolge bei acht
  // Techniken alle acht Tage in derselben Abfolge.
  const index = (Math.floor(zahl / 1) * 3 + versatz) % TECHNIKEN.length
  return TECHNIKEN[((index % TECHNIKEN.length) + TECHNIKEN.length) % TECHNIKEN.length]
}

/** Sehr kurze Wörter tragen keine Bedeutung und stören jeden Vergleich. */
const FUELLWOERTER = new Set([
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'das', 'der', 'die', 'ein', 'eine',
  'und', 'ist', 'war', 'hat', 'den', 'dem', 'mit', 'auf', 'für', 'von', 'bin',
  'mir', 'mich', 'sich', 'nicht', 'auch', 'noch', 'schon', 'aber', 'als',
])

/**
 * Das Gerüst eines Satzes – seine Form, nicht sein Inhalt.
 *
 * Erfasst wird: womit er anfängt, wie viele Sätze er hat und wie lang sie
 * sind. Genau das war bei den vier Beispielen oben identisch, während sich
 * die Wörter unterschieden.
 */
export function satzGeruest(text: string): string {
  const saetze = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(Boolean)

  const anfang = (satz: string) =>
    satz.toLowerCase().replace(/[^a-zäöüß\s]/g, '').split(/\s+/).slice(0, 2).join(' ')

  // Längen grob in drei Klassen: Ein Wort mehr oder weniger ändert die Form nicht.
  const laenge = (satz: string) => {
    const n = satz.split(/\s+/).filter(Boolean).length
    return n <= 3 ? 'k' : n <= 7 ? 'm' : 'l'
  }

  return saetze.map(s => `${anfang(s)}/${laenge(s)}`).join('|')
}

/**
 * Hat dieser Satz dieselbe Form wie einer der letzten?
 *
 * Verglichen wird nur der Anfang des ersten Satzes plus die Längenklassen.
 * "Ich stehe auf den Fliesen. Es zieht." und "Ich stehe auf dem Tisch. Das
 * reicht als Plan." sind danach dieselbe Form – und genau das sollen sie sein.
 */
export function gleicheForm(neu: string, letzte: string[]): boolean {
  const geruest = satzGeruest(neu)
  if (!geruest) return false
  const ersterTeil = geruest.split('|')[0]
  return letzte.some(alt => satzGeruest(alt).split('|')[0] === ersterTeil)
}

/**
 * Trägt der Satz überhaupt etwas Eigenes?
 *
 * Der Test aus dem Auftrag: Könnte er genauso über jede beliebige Katze
 * stehen? Ein Anker ist ein Ortsname, eine Futtersorte, ein Name, eine Zahl
 * oder ein Wort aus den Erinnerungen. Ohne Anker ist der Satz austauschbar.
 *
 * Bewusst als weiche Prüfung gedacht: Nicht jeder Satz braucht einen Anker,
 * sonst entsteht wieder das Hineinstopfen von Daten. Aber wenn alle drei
 * Stimmen an einem Tag ohne auskommen, war der Tag nicht der Grund.
 */
export function hatAnker(text: string, anker: string[]): boolean {
  const klein = text.toLowerCase()
  if (/\d/.test(klein)) return true
  // Die Anweisung rät von Ziffern ab, also stehen Mengen ausgeschrieben da.
  // "Zweimal Fisch" ohne diese Liste als ankerlos zu werten wäre falsch.
  if (/\b(einmal|zweimal|dreimal|viermal|fünfmal|beide|beiden)\b/.test(klein)) return true
  return anker.some(a => a.length >= 4 && klein.includes(a.toLowerCase()))
}

/**
 * Die zuletzt verwendeten Satzanfänge, für die Anweisung an das Modell.
 *
 * Ohne die Längenklasse: Für das Modell zählt, womit ein Satz anfing, nicht
 * wie lang er war. "ich stehe/m" wäre in einer Anweisung nur verwirrend.
 */
export function letzteAnfaenge(saetze: string[], anzahl = 6): string[] {
  return Array.from(new Set(
    saetze
      .map(s => satzGeruest(s).split('|')[0].split('/')[0].trim())
      .filter(a => a && !FUELLWOERTER.has(a)),
  )).slice(0, anzahl)
}

/**
 * Der Teil der Anweisung, der sich täglich ändert.
 *
 * Enthält die Technik des Tages und die zuletzt benutzten Satzanfänge. Beides
 * gehört zusammen: Die Technik gibt die Richtung vor, die Anfänge schließen
 * den ausgetretenen Pfad.
 */
export function tagesAnweisung(technik: Technik, letzteSaetze: string[]): string {
  const anfaenge = letzteAnfaenge(letzteSaetze)
  const teile = [
    `TECHNIK FÜR HEUTE: ${technik.name}`,
    technik.anweisung,
    `Beispiel: ${technik.beispiel}`,
    'Halte dich an diese Technik. Sie wechselt täglich, damit nicht jeden Tag',
    'derselbe Witz in anderen Worten dasteht.',
  ]

  if (anfaenge.length > 0) {
    teile.push(
      '',
      `ZULETZT BENUTZTE SATZANFÄNGE: ${anfaenge.map(a => `„${a}…"`).join(', ')}`,
      'Fang anders an. Nicht wieder mit demselben Muster aus Ich + Verb + Ort.',
    )
  }

  return teile.join('\n')
}

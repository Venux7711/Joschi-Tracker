/**
 * Welche Fotos eines Tages bekommt das Modell zu sehen?
 *
 * Die erste Fassung nahm drei Bilder gleichmäßig über den Tag verteilt – nach
 * Position in der Liste. Das hat zwei Schwächen, die beide auffallen, sobald
 * an einem Tag mehr als eine Handvoll Fotos entsteht.
 *
 * Erstens: Fünfzehn Fotos, drei ausgewählt, zwölf nie gesehen. Und weil die
 * Auswahl deterministisch war, kamen beim Würfeln exakt dieselben drei wieder.
 * Der Tag hatte mehr zu erzählen, als je erzählt werden konnte.
 *
 * Zweitens: Gleichmäßig nach Position ist nicht gleichmäßig nach Inhalt. Wer
 * um 14 Uhr eine Serie von zehn Bildern macht und sonst nichts, bekommt drei
 * fast identische Aufnahmen derselben Situation.
 *
 * Deshalb wird jetzt zuerst nach Situationen gruppiert und daraus ausgewählt –
 * mit einem Versatz, der beim Würfeln andere Bilder nach vorn holt.
 */

export type FotoKandidat = {
  id: string
  /** Zeitpunkt in ISO-Form. */
  taken_at: string
  place: string | null
  cat_ids: string[] | null
  cat_id: string | null
  public_url: string | null
  poster_url: string | null
  media_type: string | null
}

export type Situation = {
  /** Die Fotos dieser Situation, zeitlich sortiert. */
  fotos: FotoKandidat[]
  /** Wie viele verschiedene Katzen darauf markiert sind. */
  katzen: number
  /** Der früheste Zeitpunkt – bestimmt die Reihenfolge. */
  beginn: string
}

const markierte = (f: FotoKandidat): string[] =>
  f.cat_ids?.length ? f.cat_ids : f.cat_id ? [f.cat_id] : []

/**
 * Wie fein Situationen getrennt werden: 45 Minuten.
 *
 * Kürzer, und eine Fotoserie über eine Viertelstunde zerfällt in mehrere
 * "Situationen", obwohl es dieselbe ist. Länger, und ein Vormittag am Fenster
 * verschmilzt mit dem Mittagessen.
 */
const FENSTER_MINUTEN = 45

/**
 * Fasst Fotos zu Situationen zusammen.
 *
 * Zwei Aufnahmen gehören zusammen, wenn sie zeitlich nah beieinander liegen
 * und am selben Ort entstanden. Genau das macht sie zu Beinahe-Dubletten: Wer
 * zehn Bilder derselben schlafenden Katze macht, hat einmal etwas gesehen.
 */
export function zuSituationen(fotos: FotoKandidat[]): Situation[] {
  const sortiert = [...fotos].sort((a, b) => a.taken_at.localeCompare(b.taken_at))
  const situationen: Situation[] = []

  for (const f of sortiert) {
    const letzte = situationen[situationen.length - 1]
    const zeit = Date.parse(f.taken_at)
    const passt = letzte
      && (letzte.fotos[0].place ?? null) === (f.place ?? null)
      && zeit - Date.parse(letzte.fotos[letzte.fotos.length - 1].taken_at) <= FENSTER_MINUTEN * 60_000

    if (passt) {
      letzte.fotos.push(f)
      letzte.katzen = new Set(letzte.fotos.flatMap(markierte)).size
    } else {
      situationen.push({ fotos: [f], katzen: new Set(markierte(f)).size, beginn: f.taken_at })
    }
  }

  return situationen
}

/** Die anzeigbare Adresse – bei Videos das Standbild. */
export function bildAdresse(f: FotoKandidat): string | null {
  return f.media_type === 'video' ? f.poster_url : f.public_url
}

/**
 * Wählt die Fotos aus, die den Tag am besten erklären.
 *
 * Nicht die schönsten – die weiß niemand zu bestimmen –, sondern die
 * unterschiedlichsten: verschiedene Situationen, über den Tag verteilt, und
 * wo möglich eine mit beiden Katzen.
 *
 * Der Versatz ist der zweite Zweck dieser Funktion. Beim Würfeln kommt er
 * erhöht herein und schiebt sowohl die Auswahl der Situationen als auch die
 * des Bildes innerhalb einer Situation weiter. So erzählt derselbe Tag beim
 * nächsten Wurf eine andere Geschichte, statt dieselben drei Bilder erneut
 * vorzulegen.
 */
export function waehleFotos(
  fotos: FotoKandidat[],
  anzahl = 3,
  versatz = 0,
): { id: string; url: string }[] {
  const brauchbar = fotos.filter(f => bildAdresse(f))
  if (brauchbar.length === 0) return []

  const situationen = zuSituationen(brauchbar)

  // Gibt es weniger Situationen als Plätze, kommt jede dran – und die
  // verbleibenden Plätze füllen weitere Bilder aus den größten Situationen.
  const gewaehlt: FotoKandidat[] = []

  if (situationen.length <= anzahl) {
    // Erst je eine aus jeder Situation, damit keine ausfällt
    for (const s of situationen) {
      gewaehlt.push(s.fotos[versatz % s.fotos.length])
    }
    // Dann auffüllen aus den bilderreichsten Situationen
    const nachGroesse = [...situationen].sort((a, b) => b.fotos.length - a.fotos.length)
    let runde = 1
    while (gewaehlt.length < anzahl && runde < 6) {
      for (const s of nachGroesse) {
        if (gewaehlt.length >= anzahl) break
        if (s.fotos.length <= runde) continue
        const kandidat = s.fotos[(versatz + runde) % s.fotos.length]
        if (!gewaehlt.some(g => g.id === kandidat.id)) gewaehlt.push(kandidat)
      }
      runde++
    }
  } else {
    // Mehr Situationen als Plätze: gleichmäßig über den Tag auswählen, mit
    // dem Versatz als Startpunkt. Beim zweiten Wurf sind es andere.
    const schritt = situationen.length / anzahl
    for (let i = 0; i < anzahl; i++) {
      const index = Math.floor(i * schritt + versatz) % situationen.length
      const s = situationen[index]
      const kandidat = s.fotos[versatz % s.fotos.length]
      if (!gewaehlt.some(g => g.id === kandidat.id)) gewaehlt.push(kandidat)
    }

    // Eine Situation mit beiden Katzen ist besonders wertvoll – wenn keine
    // dabei ist, aber eine existiert, ersetzt sie die letzte Auswahl.
    const beide = situationen.find(s => s.katzen >= 2)
    if (beide && !gewaehlt.some(g => markierte(g).length >= 2)) {
      const kandidat = beide.fotos[versatz % beide.fotos.length]
      if (!gewaehlt.some(g => g.id === kandidat.id)) {
        gewaehlt[gewaehlt.length - 1] = kandidat
      }
    }
  }

  return gewaehlt
    .sort((a, b) => a.taken_at.localeCompare(b.taken_at))
    .map(f => ({ id: f.id, url: bildAdresse(f)! }))
}

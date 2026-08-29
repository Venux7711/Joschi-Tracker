/**
 * Reaktionen auf Fotos und Kommentare.
 *
 * Eigene Datei, weil sowohl die API-Route als auch die Oberfläche sie braucht:
 * Next.js lässt in Routen-Dateien nur die HTTP-Handler als Export zu, eine
 * Konstante dort bricht den Build.
 */

/**
 * Die Schnellauswahl – was ohne Umweg dasteht.
 *
 * Bewusst kurz: Sechs Knöpfe passen nebeneinander aufs Handy. Alles andere
 * liegt hinter dem Plus, so wie man es aus Teams oder Slack kennt.
 */
export const REACTIONS = ['❤️', '😻', '🥰', '👍', '😂', '🐾'] as const

export type Reaction = string

/**
 * Ist das ein einzelnes Emoji?
 *
 * Die Prüfung ist nötig, weil in der Datenbank sonst beliebiger Text stünde:
 * Das Feld nimmt alles, und die Oberfläche stellt es ungeprüft dar. Erlaubt
 * ist genau ein Zeichen im weiteren Sinn – auch zusammengesetzte wie 👨‍👩‍👧
 * oder solche mit Hautton, die aus mehreren Codepunkten bestehen.
 *
 * Aufbau: ein Bildzeichen, gefolgt von beliebig vielen Ergänzungen –
 * Variationszeichen, Hauttöne, Ziffern-Kombinationen und mit Nullbreiten-
 * Verbinder angehängte weitere Bildzeichen. Dazu die Flaggen, die aus zwei
 * Regionalbuchstaben bestehen.
 */
const EIN_EMOJI =
  /^(?:\p{RI}\p{RI}|\p{Extended_Pictographic}(?:️|︎|\p{Emoji_Modifier}|⃣)*(?:‍(?:\p{Extended_Pictographic}|\p{RI}\p{RI})(?:️|︎|\p{Emoji_Modifier}|⃣)*)*)$/u

export function isReaction(value: unknown): value is Reaction {
  if (typeof value !== 'string') return false
  // Obergrenze gegen aufgeblähte Ketten: Selbst die längsten Familien-Emojis
  // bleiben deutlich darunter, und die Spalte soll kein Textfeld werden.
  if (value.length === 0 || value.length > 32) return false
  return EIN_EMOJI.test(value)
}

/**
 * Die Auswahl hinter dem Plus, nach Themen sortiert.
 *
 * Handverlesen statt vollständig: Eine komplette Emoji-Tabelle wären über
 * 3600 Zeichen, die niemand durchblättert, und sie müsste als Datei mitgeladen
 * werden. Diese Auswahl deckt ab, was in einem Katzen-Tagebuch tatsächlich
 * vorkommt, und lässt sich durchsuchen.
 */
export const EMOJI_GRUPPEN: { titel: string; emojis: string[] }[] = [
  {
    titel: 'Katzen & Tiere',
    emojis: [
      '🐱', '🐈', '🐈‍⬛', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
      '🐾', '🐕', '🐶', '🐦', '🐭', '🐹', '🦴', '🧶', '🎣', '🐟', '🍗', '🥛',
    ],
  },
  {
    titel: 'Herzen & Zuneigung',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💗', '💓', '💕',
      '💞', '💘', '💝', '😍', '🥰', '😘', '🤗', '🫶', '💐', '🌹',
    ],
  },
  {
    titel: 'Freude',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😂', '🤣', '🙂', '😊', '😇', '🤩', '🥳',
      '😎', '🤠', '🥹', '☺️', '😌', '🙃', '😉', '🤪', '😜', '🤭',
    ],
  },
  {
    titel: 'Zustimmung',
    emojis: [
      '👍', '👏', '🙌', '🤝', '💪', '✅', '☑️', '💯', '🔥', '⭐', '🌟', '✨',
      '🏆', '🥇', '🎉', '🎊', '🙏', '🤞', '👌', '🫰',
    ],
  },
  {
    titel: 'Sorge & Zweifel',
    emojis: [
      '😢', '😭', '🥺', '😔', '😟', '😕', '🙁', '😞', '😣', '😖', '😩', '😮',
      '😳', '🤔', '🤨', '😐', '😬', '🫤', '👎', '⚠️', '❗', '❓',
    ],
  },
  {
    titel: 'Gesundheit & Alltag',
    emojis: [
      '🩺', '💊', '💉', '🌡️', '🏥', '🤒', '🤢', '🤮', '😴', '💤', '🚽', '🧻',
      '🧼', '🛁', '🍽️', '🥫', '🥣', '⚖️', '📏', '📈', '📉', '🗓️',
    ],
  },
  {
    titel: 'Wetter & Orte',
    emojis: [
      '☀️', '🌤️', '⛅', '🌧️', '⛈️', '❄️', '🌈', '🌙', '⭐', '🏠', '🏡', '🌳',
      '🌷', '🍀', '🚗', '✈️', '🧳', '🗺️', '📍', '🕐',
    ],
  },
  {
    titel: 'Sonstiges',
    emojis: [
      '📸', '🎬', '🎁', '🎂', '🎈', '🍰', '☕', '🍪', '🎵', '💡', '🔍', '📝',
      '📌', '🔔', '🎯', '🧩', '👀', '🙈', '🤷', '🫡',
    ],
  },
]

/**
 * Suchbegriffe je Emoji – ohne die wäre das Suchfeld nutzlos, weil ein Emoji
 * selbst keinen durchsuchbaren Text enthält. Nur für die häufig Gesuchten;
 * ohne Treffer wird die volle Auswahl gezeigt.
 */
export const EMOJI_STICHWORTE: Record<string, string> = {
  '❤️': 'herz liebe rot', '🧡': 'herz orange', '💛': 'herz gelb', '💚': 'herz gruen',
  '💙': 'herz blau', '💜': 'herz lila', '🖤': 'herz schwarz', '🤍': 'herz weiss',
  '💖': 'herz funkeln', '💕': 'herzen', '😍': 'verliebt herz augen', '🥰': 'verliebt',
  '😘': 'kuss', '🤗': 'umarmung', '🫶': 'herz haende',
  '🐱': 'katze cat', '🐈': 'katze cat', '🐈‍⬛': 'katze schwarz', '😺': 'katze',
  '😸': 'katze freude', '😹': 'katze lachen', '😻': 'katze verliebt',
  '😼': 'katze frech', '😽': 'katze kuss', '🙀': 'katze schreck',
  '😿': 'katze traurig', '😾': 'katze wuetend', '🐾': 'pfote tapsen',
  '👍': 'daumen gut ok', '👎': 'daumen schlecht', '👏': 'applaus klatschen',
  '🙌': 'jubel', '💪': 'stark', '✅': 'haken erledigt', '💯': 'hundert top',
  '🔥': 'feuer super', '⭐': 'stern', '✨': 'funkeln', '🎉': 'party feier',
  '😂': 'lachen traenen', '🤣': 'lachen', '😀': 'lachen freude', '😊': 'freude',
  '🥳': 'party feiern', '😎': 'cool',
  '😢': 'traurig weinen', '😭': 'weinen', '🥺': 'bettel traurig',
  '🤔': 'nachdenken', '😴': 'schlafen muede', '💤': 'schlafen',
  '🩺': 'arzt tierarzt gesundheit', '💊': 'medikament tablette',
  '💉': 'spritze impfung', '🤢': 'uebel schlecht', '🤮': 'erbrechen kotzen',
  '🚽': 'klo kot durchfall', '🥫': 'dose futter', '🍽️': 'futter essen',
  '⚖️': 'gewicht waage', '📸': 'foto kamera', '🎬': 'video film',
  '🎂': 'geburtstag torte', '🎁': 'geschenk', '📍': 'ort standort',
  '🏠': 'zuhause haus', '☀️': 'sonne wetter', '🌧️': 'regen wetter',
  '👀': 'augen schauen', '🙈': 'affe sehen',
}

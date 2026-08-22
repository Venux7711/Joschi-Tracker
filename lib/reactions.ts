/**
 * Erlaubte Reaktionen auf ein Foto – bewusst eine kleine, feste Auswahl.
 *
 * Eigene Datei, weil sowohl die API-Route als auch die Oberfläche sie
 * braucht: Next.js lässt in Routen-Dateien nur die HTTP-Handler als Export zu,
 * eine Konstante dort bricht den Build.
 */
export const REACTIONS = ['❤️', '😻', '🥰', '👍', '😂', '🐾'] as const

export type Reaction = (typeof REACTIONS)[number]

export function isReaction(value: unknown): value is Reaction {
  return typeof value === 'string' && (REACTIONS as readonly string[]).includes(value)
}

/**
 * Welche Fassung der App läuft gerade?
 *
 * Klingt nach Buchhaltung, ist aber praktisch wichtig: Als App auf dem
 * Startbildschirm bleibt eine Seite auf dem iPhone tagelang im Hintergrund
 * geladen. Sie holt sich neue Fassungen nicht von selbst – man tippt auf ein
 * Symbol, das alte Programm meldet sich zurück, und Korrekturen kommen nie an.
 * Genau das ist passiert: Drei Fehlerbehebungen am Video-Verkleinern liefen
 * ins Leere, weil das Handy noch den Stand von vorgestern ausführte.
 *
 * Der Wert wird beim Bauen eingesetzt (siehe next.config.js). Der Browser hat
 * ihn fest im Programm, der Server liefert unter /api/version den der gerade
 * ausgelieferten Fassung. Sind beide verschieden, läuft etwas Altes.
 */
export const AKTUELLE_VERSION = process.env.NEXT_PUBLIC_BUILD ?? 'dev'

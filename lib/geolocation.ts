/**
 * Standort vom Gerät – als Ersatz, wenn im Bild keiner steckt.
 *
 * Warum das nötig ist: Ein Foto, das über den Kamera-Knopf in der App
 * entsteht, enthält keine EXIF-Koordinaten. Der Browser gibt der Seite nur
 * die Bilddaten, nicht den Ort. Nur Bilder aus der Fotobibliothek bringen
 * welche mit – und auch das nur, wenn iOS sie beim Teilen nicht entfernt.
 * Deshalb blieb der Ort bei den meisten Aufnahmen leer.
 */

export type Ort = { lat: number; lng: number }

/**
 * Wie frisch muss eine Datei sein, damit der aktuelle Gerätestandort als ihr
 * Aufnahmeort durchgeht? Zwei Stunden.
 *
 * Der Wert ist der eigentliche Kern: Für ein gerade aufgenommenes Bild ist
 * "wo bin ich jetzt" richtig. Für ein Bild von letzter Woche wäre es
 * schlicht falsch – und ein falscher Ort ist schlechter als gar keiner, weil
 * die Übersicht "wo waren die Katzen wann" dann Unsinn behauptet.
 */
export const FRISCH_MS = 2 * 60 * 60 * 1000

export function istFrisch(file: { lastModified?: number }, jetzt = Date.now()): boolean {
  // Ohne Zeitstempel keine Annahme treffen – lieber ohne Ort als mit falschem
  if (!file.lastModified) return false
  const alter = jetzt - file.lastModified
  // Negativ bedeutet: Zeitstempel liegt in der Zukunft (falsch gestellte Uhr).
  // Kleine Abweichungen sind normal, größere machen die Angabe wertlos.
  return alter >= -5 * 60 * 1000 && alter <= FRISCH_MS
}

/**
 * Fragt den Browser nach dem Standort. Gibt null zurück statt zu werfen:
 * Der Nutzer kann ablehnen, das Gerät kann drinnen keinen Fix bekommen, und
 * in keinem dieser Fälle darf ein Upload scheitern.
 */
export function aktuellerOrt(timeoutMs = 10_000): Promise<Ort | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)

  return new Promise(fertig => {
    let erledigt = false
    const einmal = (o: Ort | null) => { if (!erledigt) { erledigt = true; fertig(o) } }

    // Eigene Uhr zusätzlich zum Timeout der Schnittstelle: Auf manchen Geräten
    // meldet sich getCurrentPosition weder mit Erfolg noch mit Fehler zurück,
    // und dann hinge der Upload.
    const uhr = setTimeout(() => einmal(null), timeoutMs + 1_000)

    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(uhr)
        einmal({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        clearTimeout(uhr)
        einmal(null)
      },
      // Kein enableHighAccuracy: Für "welcher Ort ist das" reicht die grobe
      // Bestimmung, und sie kommt deutlich schneller und ohne GPS-Fix.
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    )
  })
}

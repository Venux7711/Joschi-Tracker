/**
 * Koordinaten zu einem lesbaren Ort auflösen.
 *
 * Rohe Zahlen wie "49.4689, 11.0956" sagen niemandem etwas – für die Frage
 * "wo waren die Katzen wann" braucht es einen Namen.
 *
 * Genutzt wird Nominatim von OpenStreetMap: kostenlos, ohne Schlüssel. Die
 * Nutzungsbedingungen verlangen einen aussagekräftigen User-Agent und höchstens
 * eine Anfrage pro Sekunde – deshalb wird nur beim Hochladen aufgelöst und das
 * Ergebnis gespeichert, nicht bei jeder Anzeige.
 */
const USER_AGENT = 'JoschiBellaTracker/1.0 (privates Haustier-Tagebuch)'

type NominatimAddress = {
  road?: string
  pedestrian?: string
  neighbourhood?: string
  suburb?: string
  hamlet?: string
  village?: string
  town?: string
  city?: string
  municipality?: string
  county?: string
  state?: string
  country?: string
}

/**
 * Baut eine kurze Bezeichnung: möglichst Straße oder Viertel plus Ort.
 * Zwei Ebenen reichen – "Hintermayrstraße, Nürnberg" ist erkennbar, die
 * vollständige Nominatim-Zeile mit Postleitzahl und Land wäre nur Ballast.
 */
export function buildPlaceLabel(address: NominatimAddress): string | null {
  const fein = address.road ?? address.pedestrian ?? address.neighbourhood ?? address.suburb ?? address.hamlet
  const grob = address.city ?? address.town ?? address.village ?? address.municipality ?? address.county

  if (fein && grob && fein !== grob) return `${fein}, ${grob}`
  return fein ?? grob ?? address.state ?? address.country ?? null
}

/** Gibt null zurück, wenn nichts zu holen ist – ein Upload darf daran nie scheitern. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    // zoom 16 entspricht Straßen-/Viertelebene – genauer wäre eine Hausnummer,
    // gröber nur noch die Stadt
    url.searchParams.set('zoom', '16')
    url.searchParams.set('accept-language', 'de')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return null
    const data = await res.json()
    return data?.address ? buildPlaceLabel(data.address) : null
  } catch {
    return null
  }
}

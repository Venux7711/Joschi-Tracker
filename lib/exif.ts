/**
 * Liest GPS-Koordinaten aus einem JPEG – ohne Bibliothek und im Browser
 * lauffähig, weil die Bilder direkt vom Gerät in den Speicher hochgeladen
 * werden und der Server die Datei nie zu sehen bekommt.
 *
 * Wichtig zur Erwartung: Nicht jedes Foto hat einen Ort. iOS hängt ihn nur an,
 * wenn das Bild aus der Fotobibliothek gewählt wird und die Ortungsdienste für
 * die Kamera aktiv waren. Über den Kamera-Knopf im Browser aufgenommene Bilder
 * haben grundsätzlich keine Koordinaten. Von fünf Stichproben trug genau eine
 * welche.
 */
export type PhotoLocation = { lat: number; lng: number }

export function readGpsFromJpeg(buffer: ArrayBuffer): PhotoLocation | null {
  const buf = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  if (buf.byteLength < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null

  const ascii = (o: number, n: number) =>
    String.fromCharCode(...bytes.slice(o, o + n))

  let i = 2
  while (i < buf.byteLength - 1) {
    if (bytes[i] !== 0xFF) { i++; continue }
    const marker = bytes[i + 1]
    // Start of Scan – ab hier kommen Bilddaten, EXIF wäre längst vorbei
    if (marker === 0xDA) return null
    if (marker >= 0xD0 && marker <= 0xD9) { i += 2; continue }
    if (i + 4 > buf.byteLength) return null
    const len = buf.getUint16(i + 2)

    if (marker === 0xE1 && ascii(i + 4, 6) === 'Exif\0\0') {
      const t = i + 10
      if (t + 8 > buf.byteLength) return null
      const le = ascii(t, 2) === 'II'
      const u16 = (o: number) => buf.getUint16(o, le)
      const u32 = (o: number) => buf.getUint32(o, le)
      const rational = (o: number) => {
        const d = u32(o + 4)
        return d === 0 ? 0 : u32(o) / d
      }

      const ifd0 = t + u32(t + 4)
      if (ifd0 + 2 > buf.byteLength) return null

      let gpsOff: number | null = null
      const n0 = u16(ifd0)
      for (let k = 0; k < n0; k++) {
        const e = ifd0 + 2 + k * 12
        if (e + 12 > buf.byteLength) break
        if (u16(e) === 0x8825) gpsOff = t + u32(e + 8)
      }
      if (gpsOff === null || gpsOff + 2 > buf.byteLength) return null

      let latRef = 'N', lngRef = 'E'
      let lat: number[] | null = null, lng: number[] | null = null
      const nG = u16(gpsOff)
      for (let k = 0; k < nG; k++) {
        const e = gpsOff + 2 + k * 12
        if (e + 12 > buf.byteLength) break
        const tag = u16(e)
        const count = u32(e + 4)
        // Werte über 4 Byte stehen ausgelagert, sonst direkt im Eintrag
        const at = count * 8 > 4 ? t + u32(e + 8) : e + 8
        if (at + 24 > buf.byteLength && (tag === 2 || tag === 4)) continue
        if (tag === 1) latRef = ascii(e + 8, 1)
        if (tag === 3) lngRef = ascii(e + 8, 1)
        if (tag === 2) lat = [rational(at), rational(at + 8), rational(at + 16)]
        if (tag === 4) lng = [rational(at), rational(at + 8), rational(at + 16)]
      }
      if (!lat || !lng) return null

      const dms = (a: number[]) => a[0] + a[1] / 60 + a[2] / 3600
      const result = {
        lat: (latRef === 'S' ? -1 : 1) * dms(lat),
        lng: (lngRef === 'W' ? -1 : 1) * dms(lng),
      }
      // 0/0 ist der Nullpunkt im Atlantik – praktisch immer ein leerer Tag
      if (!isFinite(result.lat) || !isFinite(result.lng)) return null
      if (result.lat === 0 && result.lng === 0) return null
      if (Math.abs(result.lat) > 90 || Math.abs(result.lng) > 180) return null
      return result
    }
    i += 2 + len
  }
  return null
}

/** Bequemer Zugriff für einen Datei-Upload; wirft nie. */
export async function readGpsFromFile(file: File): Promise<PhotoLocation | null> {
  try {
    // Der EXIF-Block steht am Dateianfang – 256 KB reichen sicher
    const head = await file.slice(0, 256 * 1024).arrayBuffer()
    return readGpsFromJpeg(head)
  } catch {
    return null
  }
}

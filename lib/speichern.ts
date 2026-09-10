/**
 * Ein Foto oder Video aufs Gerät holen – auf dem iPhone ins Fotoalbum.
 *
 * Der naheliegende Weg funktioniert hier nicht: <a download> wird ignoriert,
 * sobald die Datei von einer anderen Herkunft kommt, und das tut sie – die
 * Bilder liegen bei Supabase, die App auf Vercel. Safari öffnet die Datei dann
 * bloß, statt sie zu sichern.
 *
 * Der Weg, der auf dem iPhone wirklich im Fotoalbum endet, ist die Freigabe:
 * Das Blatt bietet dort "Bild sichern" beziehungsweise "Video sichern" an.
 * Dafür muss die Datei aber im Browser vorliegen, nicht bloß als Adresse –
 * deshalb wird sie zuerst geholt. Der Speicher gibt sie für fremde Herkunft
 * frei (Access-Control-Allow-Origin: *), sonst ginge auch das nicht.
 *
 * Wo es keine Freigabe für Dateien gibt – Rechner, ältere Browser –, bleibt es
 * beim Herunterladen über einen kurzlebigen blob:-Verweis. Der ist gleicher
 * Herkunft, und dort greift download wieder.
 */

/** Was am Ende passiert ist – die App sagt es unterschiedlich. */
export type Ergebnis = 'geteilt' | 'geladen' | 'abgebrochen' | 'fehler'

/**
 * Die Dateiendung, und zwar aus der Adresse.
 *
 * Der Mime-Typ ist nur die zweite Wahl: Er kommt als "video/quicktime" oder
 * "image/jpeg" zurück und müsste erst zurückübersetzt werden, während in der
 * Adresse die richtige Endung schon dasteht.
 */
export function dateiEndung(url: string, mime?: string | null): string {
  const ohneFrage = url.split('?')[0]
  const treffer = /\.([a-z0-9]{2,5})$/i.exec(ohneFrage)
  if (treffer) return treffer[1].toLowerCase()

  if (mime?.startsWith('video/')) return mime.includes('quicktime') ? 'mov' : 'mp4'
  if (mime === 'image/png') return 'png'
  return 'jpg'
}

/**
 * Ein Name, an dem man die Datei später wiedererkennt.
 *
 * "IMG_4711.jpg" sagt in einem Album mit zehntausend Bildern nichts. Wer ist
 * drauf und wann war es – das sind die beiden Fragen, die man einem
 * heruntergeladenen Katzenfoto stellt.
 *
 * Bewusst nur Buchstaben, Ziffern und Bindestriche: Umlaute und Doppelpunkte
 * überstehen nicht jedes Dateisystem, und ein Name, der beim Sichern
 * abgeschnitten wird, ist schlimmer als ein schlichter.
 */
export function dateiname(o: {
  url: string
  mime?: string | null
  /** Zeitpunkt in ISO-Form. */
  aufgenommen: string
  /** Wer markiert ist, in Anzeigeform. */
  namen?: string[]
}): string {
  const wer = (o.namen ?? [])
    // NFD zerlegt "ö" in o + Trema, der Bereich darunter wirft die
    // Kombinationszeichen weg. Als Escape geschrieben, weil solche Zeichen
    // sonst unsichtbar im Quelltext stehen.
    .map(n => n.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .map(n => n.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)
    .join('-')

  // Aus der ISO-Form direkt geschnitten statt über die Zeitzone gerechnet:
  // Der Name muss nicht auf die Minute stimmen, sondern eindeutig sein.
  const zeit = o.aufgenommen.replace(/[:.]/g, '-').slice(0, 16)

  return `${wer || 'Katzen'}-${zeit}.${dateiEndung(o.url, o.mime)}`.replace(/-+/g, '-')
}

/** Kann dieser Browser Dateien freigeben? */
function kannTeilen(datei: File): boolean {
  if (typeof navigator === 'undefined') return false
  const n = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  return typeof n.share === 'function' && typeof n.canShare === 'function'
    && n.canShare({ files: [datei] })
}

/** Der Rückfall: ein blob:-Verweis, der gleicher Herkunft ist. */
function herunterladen(blob: Blob, name: string): void {
  const adresse = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = adresse
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Nicht sofort freigeben: Manche Browser holen die Daten erst danach ab.
  setTimeout(() => URL.revokeObjectURL(adresse), 60_000)
}

/**
 * Holt die Datei und bietet sie zum Sichern an.
 *
 * Zuerst die Freigabe, weil nur sie auf dem iPhone im Fotoalbum landet; erst
 * wenn es die nicht gibt oder sie abgelehnt wird, das Herunterladen.
 */
export async function insAlbum(o: {
  url: string
  aufgenommen: string
  namen?: string[]
}): Promise<Ergebnis> {
  try {
    const res = await fetch(o.url)
    if (!res.ok) return 'fehler'
    const blob = await res.blob()
    const name = dateiname({ ...o, mime: blob.type })
    const datei = new File([blob], name, { type: blob.type || 'application/octet-stream' })

    if (kannTeilen(datei)) {
      try {
        await navigator.share({ files: [datei] })
        return 'geteilt'
      } catch (e) {
        // Wer das Blatt wegwischt, hat nichts falsch gemacht – das ist kein
        // Fehler und darf auch nicht als einer aussehen.
        if (e instanceof DOMException && e.name === 'AbortError') return 'abgebrochen'
        // Alles andere: Es gibt ja noch den zweiten Weg.
      }
    }

    herunterladen(blob, name)
    return 'geladen'
  } catch {
    return 'fehler'
  }
}

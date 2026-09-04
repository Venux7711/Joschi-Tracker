/**
 * Verkleinerte Fassungen der Fotos – einmal gerechnet, dann für immer.
 *
 * Der Anlass war eine Rechnung, die nicht aufging: Der Bilddienst von Vercel
 * rechnete bei jedem Blick ein 2,4-MB-Foto auf 130 Pixel herunter, und weil
 * eine fertige Größe nur eine Stunde als frisch galt, tat er es Tag für Tag
 * wieder. Das Freikontingent von 5000 Umrechnungen im Monat war nach wenigen
 * Wochen aufgebraucht; danach liefern neue Bildgrößen einen Fehler.
 *
 * Ein hochgeladenes Foto ändert sich nie. Es einmal zu verkleinern und das
 * Ergebnis danebenzulegen ist deshalb nicht nur billiger, sondern die
 * naheliegende Lösung – und sie macht die App unabhängig von einem Dienst,
 * dessen Kontingent sich unbemerkt leeren kann.
 *
 * Die Originale bleiben unangetastet. Speicher ist hier nicht das Problem, und
 * ein weggerechnetes Foto kommt nicht zurück.
 */

import sharp from 'sharp'

/** Für Kacheln, Streifen und Vorschauen. Bei dreifacher Pixeldichte reicht das
 *  für alles bis etwa 130 Bildschirmpunkte – also für jede Kachel der App. */
export const KACHEL_KANTE = 400

/** Für Vollbild und die großen Karten. Deckt jedes Handy und jeden Laptop ab. */
export const ANSICHT_KANTE = 1600

/**
 * Qualität 78 statt der üblichen 82.
 *
 * Der Unterschied ist auf einem Foto nicht auszumachen, spart aber rund ein
 * Fünftel der Bytes – und diese Bytes gehen über Mobilfunk, wenn jemand die
 * Galerie durchscrollt.
 */
const QUALITAET = 78

/** Wo die Ableitungen liegen. Eigener Ordner, damit sie nie mit einem Original
 *  verwechselt und beim Aufräumen nicht übersehen werden. */
const ORDNER = 'ableitungen'
const EIMER = 'joschi-photos'

export type Ableitungen = { thumb_url: string; view_url: string }

type Speicher = {
  storage: {
    from: (eimer: string) => {
      upload: (pfad: string, daten: Buffer, o: { contentType: string; upsert: boolean }) =>
        Promise<{ error: { message: string } | null }>
      getPublicUrl: (pfad: string) => { data: { publicUrl: string } }
    }
  }
}

/**
 * Wie groß eine Quelle höchstens sein darf, bevor sie gar nicht erst geladen
 * wird. Das größte vorhandene Foto liegt bei 4,9 MB; 25 MB lassen Luft, ohne
 * dass ein Ausreißer den Speicher der Funktion sprengt.
 */
const HOECHSTENS_BYTES = 25 * 1024 * 1024

/**
 * Rechnet ein Bild auf beide Größen herunter und legt sie neben das Original.
 *
 * Gibt null zurück, wenn etwas schiefgeht – das ist ausdrücklich kein Fehler,
 * der den Aufrufer aufhalten darf. Ohne Ableitung wird eben weiter das
 * Original gezeigt; das ist langsam, aber nicht kaputt.
 */
export async function erzeugeAbleitungen(
  speicher: Speicher,
  fotoId: string,
  quelle: string,
): Promise<Ableitungen | null> {
  try {
    const res = await fetch(quelle)
    if (!res.ok) {
      console.error(`Ableitung ${fotoId}: Quelle ${res.status}`)
      return null
    }

    const roh = Buffer.from(await res.arrayBuffer())
    if (roh.byteLength > HOECHSTENS_BYTES) {
      console.error(`Ableitung ${fotoId}: Quelle zu groß (${roh.byteLength} Bytes)`)
      return null
    }

    /**
     * rotate() ohne Argument dreht nach den EXIF-Angaben und entfernt sie
     * danach. Ohne diesen Aufruf lägen Hochkantfotos vom iPhone quer: Die
     * Kamera speichert sie liegend und notiert die Drehung nur nebenbei.
     */
    const bild = sharp(roh, { failOn: 'none' }).rotate()

    const fassung = async (kante: number) =>
      bild
        .clone()
        // 'inside' ohne Vergrößerung: Ein Bild, das ohnehin kleiner ist als
        // die Zielkante, bleibt wie es ist, statt künstlich aufgeblasen zu
        // werden.
        .resize({ width: kante, height: kante, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: QUALITAET, mozjpeg: true })
        .toBuffer()

    const [kachel, ansicht] = await Promise.all([
      fassung(KACHEL_KANTE),
      fassung(ANSICHT_KANTE),
    ])

    const ablegen = async (pfad: string, daten: Buffer) => {
      // upsert: Ein zweiter Anlauf nach einem halb gelungenen Durchgang soll
      // nicht an einer bereits liegenden Datei scheitern.
      const { error } = await speicher.storage.from(EIMER)
        .upload(pfad, daten, { contentType: 'image/jpeg', upsert: true })
      if (error) throw new Error(error.message)
      return speicher.storage.from(EIMER).getPublicUrl(pfad).data.publicUrl
    }

    const [thumb_url, view_url] = await Promise.all([
      ablegen(`${ORDNER}/${fotoId}-${KACHEL_KANTE}.jpg`, kachel),
      ablegen(`${ORDNER}/${fotoId}-${ANSICHT_KANTE}.jpg`, ansicht),
    ])

    console.log(
      `Ableitung ${fotoId}: ${Math.round(roh.byteLength / 1024)} kB → ` +
      `${Math.round(kachel.byteLength / 1024)} kB / ${Math.round(ansicht.byteLength / 1024)} kB`,
    )
    return { thumb_url, view_url }
  } catch (e) {
    console.error(`Ableitung ${fotoId} fehlgeschlagen:`, e)
    return null
  }
}

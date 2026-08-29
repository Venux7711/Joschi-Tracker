/**
 * Verkleinert hochgeladene Videos im Hintergrund.
 *
 * Warum hier und nicht im Browser: Vier Anläufe auf dem iPhone sind daran
 * gescheitert, dass ein Browser zum Umrechnen das Video in Echtzeit abspielen
 * muss – mit Sichtbarkeitsregeln, Abspielsperren und der Rechenlast eines
 * Handys. Ein GitHub-Runner hat ffmpeg an Bord, nichts anderes zu tun und
 * sechs Stunden Zeit. Das Handy macht nur noch den einfachen Teil: hochladen.
 *
 * Warum nicht in einer Serverless-Funktion: Die darf auf dem Hobby-Tarif
 * höchstens eine Minute laufen und bringt kein ffmpeg mit.
 *
 * Der Ablauf je Video: herunterladen, umrechnen, Standbild greifen, das
 * Kleine hochladen, die Zeile umbiegen, das Große löschen. Schlägt etwas
 * fehl, bleibt das Original unangetastet – lieber ein großes Video als keins.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'joschi-photos'

/** Höchstens so viele je Lauf – der nächste Lauf holt den Rest. */
const PRO_LAUF = 5

/** Längste Kante. 720p reicht für ein Familienalbum. */
const MAX_KANTE = 1280

// Noch nicht eingerichtet ist kein Fehler, sondern ein Zustand. Vorher brach
// der Lauf hier hart ab – und schickte alle zehn Minuten eine Fehlermeldung,
// obwohl schlicht nichts zu tun war. Echte Fehler weiter unten bleiben laut.
if (!URL_ || !KEY) {
  console.log('⏸ Übersprungen: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen.')
  console.log('  Als Repository-Secrets hinterlegen (Settings → Secrets and variables → Actions),')
  console.log('  dann verkleinert dieser Lauf wartende Videos automatisch.')
  process.exit(0)
}

const db = createClient(URL_, KEY, { auth: { persistSession: false } })

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1)

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

/** Laufzeit in Sekunden, für die Einblendung auf der Kachel. */
function dauerVon(datei) {
  const roh = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', datei,
  ]).toString().trim()
  const zahl = Number.parseFloat(roh)
  return Number.isFinite(zahl) && zahl > 0 ? zahl : null
}

async function ladeHoch(pfad, datei, typ) {
  const { error } = await db.storage
    .from(BUCKET)
    .upload(pfad, readFileSync(datei), { contentType: typ, upsert: true })
  if (error) throw new Error(`Hochladen (${pfad}): ${error.message}`)
  return db.storage.from(BUCKET).getPublicUrl(pfad).data.publicUrl
}

async function bearbeite(zeile) {
  const arbeit = mkdtempSync(join(tmpdir(), 'video-'))
  const quelle = join(arbeit, 'quelle')
  const ziel = join(arbeit, 'klein.mp4')
  const standbild = join(arbeit, 'standbild.jpg')

  try {
    const { data: blob, error: ladeFehler } = await db.storage.from(BUCKET).download(zeile.storage_path)
    if (ladeFehler || !blob) throw new Error(`Herunterladen: ${ladeFehler?.message ?? 'keine Daten'}`)
    writeFileSync(quelle, Buffer.from(await blob.arrayBuffer()))

    const vorher = statSync(quelle).size
    console.log(`  Original: ${mb(vorher)} MB`)

    // force_divisible_by=2, weil H.264 keine ungeraden Kantenlängen mag.
    // Hochskaliert wird nie – min() lässt kleinere Videos in Ruhe.
    ffmpeg([
      '-i', quelle,
      '-vf', `scale='min(${MAX_KANTE},iw)':'min(${MAX_KANTE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
      '-c:v', 'libx264', '-crf', '26', '-preset', 'medium', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      // Die Kopfdaten nach vorn: Sonst muss der Browser die ganze Datei laden,
      // bevor er abspielen kann.
      '-movflags', '+faststart',
      ziel,
    ])

    const nachher = statSync(ziel).size
    const dauer = dauerVon(ziel)
    console.log(`  Ergebnis: ${mb(nachher)} MB (${Math.round((1 - nachher / vorher) * 100)} % kleiner)`)

    // Standbild immer erzeugen, wenn noch keins da ist – eine halbe Sekunde
    // hinein, weil das erste Bild bei Handyaufnahmen oft noch dunkel ist.
    let posterUrl = zeile.poster_url
    let posterPfad = zeile.poster_path
    if (!posterUrl) {
      ffmpeg(['-ss', '0.5', '-i', ziel, '-frames:v', '1', '-q:v', '4', standbild])
      posterPfad = `${zeile.storage_path.replace(/\.[^.]+$/, '')}-poster.jpg`
      posterUrl = await ladeHoch(posterPfad, standbild, 'image/jpeg')
      console.log('  Standbild erzeugt')
    }

    // Lohnt sich das? Unter 10 % Ersparnis bleibt das Original – ein zweites
    // Umrechnen verliert nur Qualität.
    if (nachher >= vorher * 0.9) {
      console.log('  Kaum kleiner – Original behalten')
      await db.from('photos').update({
        compress_state: 'uebersprungen',
        compressed_bytes: nachher,
        poster_url: posterUrl,
        poster_path: posterPfad,
        duration_seconds: zeile.duration_seconds ?? dauer,
      }).eq('id', zeile.id)
      return
    }

    const neuerPfad = `${zeile.storage_path.replace(/\.[^.]+$/, '')}-klein.mp4`
    const neueUrl = await ladeHoch(neuerPfad, ziel, 'video/mp4')

    // Erst die Zeile umbiegen, dann das Große löschen. Andersherum zeigte die
    // App bei einem Fehler dazwischen auf eine Datei, die es nicht mehr gibt.
    const { error: schreibFehler } = await db.from('photos').update({
      storage_path: neuerPfad,
      public_url: neueUrl,
      poster_url: posterUrl,
      poster_path: posterPfad,
      duration_seconds: zeile.duration_seconds ?? dauer,
      compressed_bytes: nachher,
      compress_state: 'fertig',
      compress_error: null,
    }).eq('id', zeile.id)
    if (schreibFehler) throw new Error(`Eintrag aktualisieren: ${schreibFehler.message}`)

    const { error: loeschFehler } = await db.storage.from(BUCKET).remove([zeile.storage_path])
    if (loeschFehler) console.warn(`  ⚠ Original blieb liegen: ${loeschFehler.message}`)
  } finally {
    rmSync(arbeit, { recursive: true, force: true })
  }
}

async function main() {
  const { data: offen, error } = await db
    .from('photos')
    .select('id, storage_path, poster_url, poster_path, duration_seconds, original_bytes')
    .eq('compress_state', 'wartet')
    .order('created_at', { ascending: true })
    .limit(PRO_LAUF)

  if (error) {
    console.error('✗ Warteschlange nicht lesbar:', error.message)
    process.exit(1)
  }
  if (!offen?.length) {
    console.log('✓ Nichts zu tun – keine wartenden Videos.')
    return
  }

  console.log(`${offen.length} Video(s) zu verkleinern`)
  let gescheitert = 0

  for (const zeile of offen) {
    console.log(`→ ${zeile.storage_path}`)
    // Als "läuft" markieren, damit ein paralleler Lauf nicht dasselbe Video
    // ein zweites Mal anfasst.
    await db.from('photos').update({ compress_state: 'laeuft' }).eq('id', zeile.id)
    try {
      await bearbeite(zeile)
      console.log('  ✓ fertig')
    } catch (e) {
      gescheitert++
      const meldung = e instanceof Error ? e.message : String(e)
      console.error(`  ✗ ${meldung}`)
      // Original bleibt, wie es ist – nur vermerken, was schiefging.
      await db.from('photos').update({
        compress_state: 'fehler',
        compress_error: meldung.slice(0, 500),
      }).eq('id', zeile.id)
    }
  }

  // Laut scheitern: Ein stiller Fehlschlag hier hieße, dass Videos in voller
  // Größe liegen bleiben und es niemand merkt.
  if (gescheitert > 0) {
    console.error(`✗ ${gescheitert} von ${offen.length} fehlgeschlagen.`)
    process.exit(1)
  }
  console.log('✓ Alle Videos verkleinert.')
}

main().catch(e => {
  console.error('✗ Unerwarteter Fehler:', e)
  process.exit(1)
})

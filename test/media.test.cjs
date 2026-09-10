const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isVideo, stillUrl, hasStill, formatDuration, isVideoFile } = require('../.test-build/media')

const foto = { public_url: 'https://x/bild.jpg', media_type: 'photo', poster_url: null }
const videoMitBild = { public_url: 'https://x/film.mp4', media_type: 'video', poster_url: 'https://x/film-poster.jpg' }
const videoOhneBild = { public_url: 'https://x/film.mp4', media_type: 'video', poster_url: null }
// Zeilen von vor der Migration haben die Spalte gar nicht
const altesFoto = { public_url: 'https://x/alt.jpg' }

test('isVideo erkennt nur echte Videos', () => {
  assert.equal(isVideo(foto), false)
  assert.equal(isVideo(videoMitBild), true)
  assert.equal(isVideo(altesFoto), false)
  assert.equal(isVideo(null), false)
})

test('stillUrl liefert beim Video das Standbild, sonst die Datei selbst', () => {
  assert.equal(stillUrl(foto), 'https://x/bild.jpg')
  assert.equal(stillUrl(altesFoto), 'https://x/alt.jpg')
  assert.equal(stillUrl(videoMitBild), 'https://x/film-poster.jpg')
})

test('hasStill schließt nur Videos ohne Standbild aus', () => {
  assert.equal(hasStill(foto), true)
  assert.equal(hasStill(altesFoto), true)
  assert.equal(hasStill(videoMitBild), true)
  assert.equal(hasStill(videoOhneBild), false)
})

test('ein Video ohne Standbild wird nie als Bild ausgeliefert', () => {
  // Der eigentliche Zweck von hasStill: Sonst bekäme ein <Image> eine
  // .mp4-Adresse und bliebe leer.
  const gefiltert = [foto, videoMitBild, videoOhneBild].filter(hasStill)
  assert.equal(gefiltert.length, 2)
  assert.ok(gefiltert.every(p => !stillUrl(p).endsWith('.mp4')))
})

test('formatDuration schreibt Minuten und Sekunden', () => {
  assert.equal(formatDuration(7), '0:07')
  assert.equal(formatDuration(83), '1:23')
  assert.equal(formatDuration(725), '12:05')
  assert.equal(formatDuration(59.6), '1:00')
})

test('formatDuration schweigt, wenn es nichts zu sagen gibt', () => {
  assert.equal(formatDuration(null), null)
  assert.equal(formatDuration(undefined), null)
  assert.equal(formatDuration(0), null)
  assert.equal(formatDuration(NaN), null)
})

test('isVideoFile geht notfalls nach der Dateiendung', () => {
  // Manche Android-Browser lassen den Typ bei .mov leer
  assert.equal(isVideoFile({ type: 'video/quicktime', name: 'IMG_1.MOV' }), true)
  assert.equal(isVideoFile({ type: '', name: 'IMG_1.MOV' }), true)
  assert.equal(isVideoFile({ type: '', name: 'clip.mp4' }), true)
  assert.equal(isVideoFile({ type: 'image/jpeg', name: 'IMG_1.JPG' }), false)
  assert.equal(isVideoFile({ type: '', name: 'katze.heic' }), false)
})

// ── Sichern aufs Gerät ──────────────────────────────────────────

const { dateiEndung, dateiname } = require('../.test-build/speichern')

test('die Endung kommt aus der Adresse', () => {
  assert.equal(dateiEndung('https://x/y/1789063902090-klein.mp4'), 'mp4')
  assert.equal(dateiEndung('https://x/y/foto.JPEG'), 'jpeg')
  assert.equal(dateiEndung('https://x/y/film.mov?token=abc'), 'mov')
})

test('ohne Endung in der Adresse hilft der Mime-Typ', () => {
  assert.equal(dateiEndung('https://x/y/ohne', 'video/quicktime'), 'mov')
  assert.equal(dateiEndung('https://x/y/ohne', 'video/mp4'), 'mp4')
  assert.equal(dateiEndung('https://x/y/ohne', 'image/png'), 'png')
  assert.equal(dateiEndung('https://x/y/ohne', null), 'jpg')
})

test('der Dateiname nennt, wer drauf ist und wann es war', () => {
  // "IMG_4711.jpg" sagt in einem Album mit zehntausend Bildern nichts.
  const name = dateiname({
    url: 'https://x/y/bild.jpg',
    aufgenommen: '2026-09-10T18:11:42.000Z',
    namen: ['Joschi', 'Bella'],
  })
  assert.equal(name, 'Joschi-Bella-2026-09-10T18-11.jpg')
})

test('Umlaute und Sonderzeichen überleben den Namen nicht', () => {
  // Sie überstehen nicht jedes Dateisystem, und ein Name, der beim Sichern
  // abgeschnitten wird, ist schlimmer als ein schlichter.
  const name = dateiname({
    url: 'https://x/y/bild.jpg',
    aufgenommen: '2026-09-10T18:11:42.000Z',
    namen: ['Käthe Müller-Lüdenscheidt'],
  })
  assert.ok(/^[A-Za-z0-9.\-]+$/.test(name), name)
  assert.ok(name.startsWith('KatheMuller'), name)
})

test('ohne Markierung bleibt ein brauchbarer Name übrig', () => {
  const name = dateiname({
    url: 'https://x/y/bild.jpg',
    aufgenommen: '2026-09-10T18:11:42.000Z',
    namen: [],
  })
  assert.ok(name.startsWith('Katzen-2026-09-10'), name)
})

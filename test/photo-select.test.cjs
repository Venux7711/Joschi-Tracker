const { test } = require('node:test')
const assert = require('node:assert/strict')
const { waehleFotos, zuSituationen, bildAdresse } = require('../.test-build/photo-select')

/** Ein Foto zu einer Uhrzeit des 1. September. */
const foto = (id, stunde, minute = 0, ueber = {}) => ({
  id,
  taken_at: `2026-09-01T${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  place: null,
  cat_ids: ['joschi'],
  cat_id: null,
  public_url: `https://x/${id}.jpg`,
  poster_url: null,
  media_type: 'photo',
  ...ueber,
})

const ids = (auswahl) => auswahl.map(a => a.id)

// ── Situationen ──────────────────────────────────────────────────────────

test('eine Fotoserie ist eine Situation, kein Dutzend', () => {
  // Wer zehn Bilder derselben schlafenden Katze macht, hat einmal etwas
  // gesehen. Ohne diese Bündelung belegen drei Aufnahmen derselben Minute
  // alle drei Plätze.
  const serie = Array.from({ length: 10 }, (_, i) => foto(`s${i}`, 14, i))
  assert.equal(zuSituationen(serie).length, 1)
})

test('Aufnahmen zu verschiedenen Tageszeiten sind verschiedene Situationen', () => {
  const s = zuSituationen([foto('a', 8), foto('b', 13), foto('c', 20)])
  assert.equal(s.length, 3)
})

test('derselbe Zeitpunkt an einem anderen Ort ist eine andere Situation', () => {
  const s = zuSituationen([
    foto('a', 14, 0, { place: 'Zuhause' }),
    foto('b', 14, 5, { place: 'Külsheim' }),
  ])
  assert.equal(s.length, 2)
})

// ── Auswahl ──────────────────────────────────────────────────────────────

test('drei Fotos aus einer Serie sind nicht dreimal dasselbe', () => {
  // Der eigentliche Anlass: Eine Serie am Nachmittag und je ein Bild morgens
  // und abends – die Auswahl muss alle drei Situationen treffen.
  const fotos = [
    foto('morgens', 8),
    ...Array.from({ length: 10 }, (_, i) => foto(`serie${i}`, 14, i)),
    foto('abends', 21),
  ]
  const auswahl = ids(waehleFotos(fotos, 3))
  assert.ok(auswahl.includes('morgens'), JSON.stringify(auswahl))
  assert.ok(auswahl.includes('abends'), JSON.stringify(auswahl))
  assert.equal(auswahl.length, 3)
})

test('beim Würfeln kommen andere Bilder', () => {
  // Vorher lagen bei jedem Wurf dieselben drei Bilder vor und nur der Text
  // änderte sich – genau das war die Klage.
  const fotos = Array.from({ length: 12 }, (_, i) => foto(`f${i}`, 6 + i))
  const erster = ids(waehleFotos(fotos, 3, 0))
  const zweiter = ids(waehleFotos(fotos, 3, 3))
  assert.notDeepEqual(erster, zweiter)
})

test('derselbe Versatz liefert dasselbe – die Anzeige darf nicht flackern', () => {
  const fotos = Array.from({ length: 12 }, (_, i) => foto(`f${i}`, 6 + i))
  assert.deepEqual(ids(waehleFotos(fotos, 3, 0)), ids(waehleFotos(fotos, 3, 0)))
})

test('über mehrere Würfe wird ein großer Teil des Tages gezeigt', () => {
  // Bei fünfzehn Fotos sollen nicht zwölf davon für immer ungesehen bleiben
  const fotos = Array.from({ length: 15 }, (_, i) => foto(`f${i}`, 6 + i, 0))
  const gesehen = new Set()
  for (let v = 0; v < 6; v++) for (const id of ids(waehleFotos(fotos, 3, v))) gesehen.add(id)
  assert.ok(gesehen.size >= 8, `nur ${gesehen.size} von 15 gesehen`)
})

test('ein Bild mit beiden Katzen kommt vor', () => {
  // Eine Situation mit beiden ist besonders wertvoll für den Dialog
  const fotos = [
    ...Array.from({ length: 8 }, (_, i) => foto(`solo${i}`, 6 + i)),
    foto('beide', 15, 0, { cat_ids: ['joschi', 'bella'] }),
  ]
  assert.ok(ids(waehleFotos(fotos, 3)).includes('beide'))
})

test('weniger Fotos als Plätze ist kein Problem', () => {
  assert.equal(waehleFotos([foto('a', 9)], 3).length, 1)
  assert.equal(waehleFotos([foto('a', 9), foto('b', 18)], 3).length, 2)
})

test('ein Tag ohne Fotos ergibt eine leere Auswahl, keinen Fehler', () => {
  // Solche Tage wird es geben. Der Gedanke entsteht dann ohne Bild.
  assert.deepEqual(waehleFotos([], 3), [])
})

test('Fotos ohne Adresse fallen weg', () => {
  const auswahl = waehleFotos([
    foto('gut', 9),
    foto('kaputt', 10, 0, { public_url: null }),
  ], 3)
  assert.deepEqual(ids(auswahl), ['gut'])
})

test('bei Videos wird das Standbild genommen', () => {
  const video = foto('v', 9, 0, { media_type: 'video', public_url: 'https://x/v.mp4', poster_url: 'https://x/v.jpg' })
  assert.equal(bildAdresse(video), 'https://x/v.jpg')
  assert.equal(waehleFotos([video], 3)[0].url, 'https://x/v.jpg')
})

test('ein Video ohne Standbild wird übersprungen', () => {
  // Ein <img> mit einer .mp4-Adresse bliebe leer, und das Modell kann es nicht lesen
  const video = foto('v', 9, 0, { media_type: 'video', public_url: 'https://x/v.mp4', poster_url: null })
  assert.deepEqual(waehleFotos([video, foto('gut', 12)], 3).map(a => a.id), ['gut'])
})

test('die Auswahl kommt in zeitlicher Reihenfolge zurück', () => {
  // Bild 1 ist das früheste – so passt die Nummerierung für das Modell zum
  // Verlauf des Tages.
  const auswahl = waehleFotos([foto('spaet', 20), foto('frueh', 7), foto('mittag', 13)], 3)
  assert.deepEqual(ids(auswahl), ['frueh', 'mittag', 'spaet'])
})

test('keine Dubletten in der Auswahl', () => {
  const fotos = Array.from({ length: 5 }, (_, i) => foto(`f${i}`, 14, i))
  for (let v = 0; v < 5; v++) {
    const auswahl = ids(waehleFotos(fotos, 3, v))
    assert.equal(new Set(auswahl).size, auswahl.length, `Versatz ${v}: ${auswahl}`)
  }
})

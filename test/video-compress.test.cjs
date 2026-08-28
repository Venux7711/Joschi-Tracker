const { test } = require('node:test')
const assert = require('node:assert/strict')
const { zielBitrate } = require('../.test-build/video-compress')

const ZIEL = 200 * 1024 * 1024 // dieselbe Zielgröße wie ZIEL_BYTES in lib/media.ts

/** Wie groß wird das Ergebnis ungefähr bei dieser Datenrate? */
const groesse = (bitrate, sekunden) => ((bitrate + 96_000) * sekunden) / 8

test('das Ergebnis bleibt unter der Zielgröße', () => {
  // Der eigentliche Zweck: Nach minutenlangem Rechnen darf die Datei nicht
  // doch zu groß sein.
  for (const sekunden of [30, 60, 120, 300, 600, 900]) {
    const b = zielBitrate(ZIEL, sekunden)
    if (b === null) continue
    assert.ok(groesse(b, sekunden) <= ZIEL, `${sekunden}s: ${groesse(b, sekunden)} > ${ZIEL}`)
  }
})

test('kurze Videos bekommen nicht unbegrenzt Datenrate', () => {
  // Ein 10-Sekunden-Clip dürfte rechnerisch 50 Mbit/s haben – das wäre größer
  // als das Original und damit sinnlos.
  assert.equal(zielBitrate(ZIEL, 10), 5_000_000)
  assert.equal(zielBitrate(ZIEL, 5), 5_000_000)
})

test('zu lange Videos werden abgelehnt statt matschig gerechnet', () => {
  // Ab hier reicht die Datenrate nicht mehr für ein ansehbares Bild. Dann ist
  // ein ehrliches "bitte kürzen" besser als ein Klumpen Pixel.
  assert.equal(zielBitrate(ZIEL, 4 * 3600), null)
  assert.equal(zielBitrate(ZIEL, 3600), null)
})

test('die Grenze zwischen machbar und zu lang ist stetig', () => {
  // Kein Loch: Es gibt genau einen Übergang, nicht mehrere. Der Bereich muss
  // weit genug reichen, um den Übergang zu enthalten – bei der aktuellen
  // Zielgröße liegt er bei gut 35 Minuten Laufzeit.
  let vorher = zielBitrate(ZIEL, 1)
  let wechsel = 0
  for (let s = 2; s <= 5000; s++) {
    const jetzt = zielBitrate(ZIEL, s)
    if ((vorher === null) !== (jetzt === null)) wechsel++
    vorher = jetzt
  }
  assert.equal(wechsel, 1)
})

test('unsinnige Dauer ergibt keine Datenrate', () => {
  assert.equal(zielBitrate(ZIEL, 0), null)
  assert.equal(zielBitrate(ZIEL, -5), null)
  assert.equal(zielBitrate(ZIEL, NaN), null)
})

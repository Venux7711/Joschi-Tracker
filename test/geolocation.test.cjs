const { test } = require('node:test')
const assert = require('node:assert/strict')
const { istFrisch, FRISCH_MS } = require('../.test-build/geolocation')

const jetzt = new Date('2026-08-24T14:00:00Z').getTime()
const vor = (ms) => ({ lastModified: jetzt - ms })

const MINUTE = 60 * 1000
const STUNDE = 60 * MINUTE

test('gerade aufgenommen: Gerätestandort gilt', () => {
  assert.equal(istFrisch(vor(0), jetzt), true)
  assert.equal(istFrisch(vor(5 * MINUTE), jetzt), true)
  assert.equal(istFrisch(vor(STUNDE), jetzt), true)
  assert.equal(istFrisch(vor(FRISCH_MS), jetzt), true)
})

test('altes Bild aus der Fotobibliothek: kein Ort statt falscher Ort', () => {
  // Der Kern der Regel: "Wo bin ich jetzt" ist für ein Bild von gestern
  // schlicht falsch, und ein falscher Ort ist schlechter als gar keiner –
  // die Übersicht "wo waren die Katzen wann" behauptete sonst Unsinn.
  assert.equal(istFrisch(vor(FRISCH_MS + MINUTE), jetzt), false)
  assert.equal(istFrisch(vor(24 * STUNDE), jetzt), false)
  assert.equal(istFrisch(vor(365 * 24 * STUNDE), jetzt), false)
})

test('ohne Zeitstempel wird nichts angenommen', () => {
  assert.equal(istFrisch({}, jetzt), false)
  assert.equal(istFrisch({ lastModified: 0 }, jetzt), false)
})

test('leicht vorgehende Uhr macht das Bild nicht ungültig', () => {
  // Handyuhren weichen um Sekunden ab; das darf den Ort nicht kosten
  assert.equal(istFrisch({ lastModified: jetzt + 30 * 1000 }, jetzt), true)
  assert.equal(istFrisch({ lastModified: jetzt + 4 * MINUTE }, jetzt), true)
})

test('deutlich in der Zukunft liegender Zeitstempel ist wertlos', () => {
  assert.equal(istFrisch({ lastModified: jetzt + STUNDE }, jetzt), false)
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  berlinDateKey, berlinDayStart, berlinDayEnd, addBerlinDays, isSameBerlinDay,
  pastBerlinDays, berlinDaysBetween, berlinHour, toBerlinInputValue,
  fromBerlinInputValue, berlinYear, fromBerlinWallClock, isIsoDay,
} = require('../.test-build/time')

// Alle Tagesgrenzen der App hängen an Europe/Berlin, nicht an der Zeitzone des
// Servers. Auf Vercel läuft alles in UTC – ohne diese Umrechnung landete eine
// Fütterung um 00:30 Uhr auf dem Vortag.

test('Mitternachts-Fütterung zählt zum Berliner Tag', () => {
  assert.equal(berlinDateKey(new Date('2026-08-07T22:30:00Z')), '2026-08-08')
  assert.equal(berlinDateKey(new Date('2026-01-14T23:30:00Z')), '2026-01-15')
})

test('Tagesgrenzen in Sommer- und Winterzeit', () => {
  const sommer = new Date('2026-08-08T12:00:00Z')
  assert.equal(berlinDayStart(sommer).toISOString(), '2026-08-07T22:00:00.000Z')
  assert.equal(berlinDayEnd(sommer).toISOString(), '2026-08-08T21:59:59.999Z')

  const winter = new Date('2026-01-15T12:00:00Z')
  assert.equal(berlinDayStart(winter).toISOString(), '2026-01-14T23:00:00.000Z')
  assert.equal(berlinDayEnd(winter).toISOString(), '2026-01-15T22:59:59.999Z')
})

test('Zeitumstellung: Tagesanfang bleibt korrekt', () => {
  // 29.03.2026 springt Berlin von 02:00 auf 03:00
  assert.equal(berlinDayStart(new Date('2026-03-29T12:00:00Z')).toISOString(), '2026-03-28T23:00:00.000Z')
  // 25.10.2026 springt Berlin von 03:00 zurück auf 02:00
  assert.equal(berlinDayStart(new Date('2026-10-25T12:00:00Z')).toISOString(), '2026-10-24T22:00:00.000Z')
  assert.equal(berlinDayEnd(new Date('2026-10-25T12:00:00Z')).toISOString(), '2026-10-25T22:59:59.999Z')
})

test('addBerlinDays über Umstellung, Monats- und Jahreswechsel', () => {
  assert.equal(berlinDateKey(addBerlinDays(new Date('2026-03-28T12:00:00Z'), 1)), '2026-03-29')
  assert.equal(berlinDateKey(addBerlinDays(new Date('2026-01-01T12:00:00Z'), -1)), '2025-12-31')
  assert.equal(berlinDateKey(addBerlinDays(new Date('2026-02-28T12:00:00Z'), 1)), '2026-03-01')
})

test('isSameBerlinDay', () => {
  const nachts = new Date('2026-08-07T22:30:00Z') // 00:30 Berliner Zeit am 8.
  assert.equal(isSameBerlinDay(nachts, new Date('2026-08-08T10:00:00Z')), true)
  assert.equal(isSameBerlinDay(nachts, new Date('2026-08-07T10:00:00Z')), false)
})

test('pastBerlinDays liefert lückenlose Tage, ältester zuerst', () => {
  const days = pastBerlinDays(30, new Date('2026-08-08T12:00:00Z'))
  assert.equal(days.length, 30)
  assert.equal(berlinDateKey(days[0]), '2026-07-10')
  assert.equal(berlinDateKey(days[29]), '2026-08-08')
  assert.equal(new Set(days.map(berlinDateKey)).size, 30, 'keine Duplikate oder Lücken')
})

test('pastBerlinDays über die Herbst-Umstellung', () => {
  const days = pastBerlinDays(7, new Date('2026-10-27T12:00:00Z'))
  assert.deepEqual(days.map(berlinDateKey), [
    '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24',
    '2026-10-25', '2026-10-26', '2026-10-27',
  ])
})

test('berlinDaysBetween rundet an 23- und 25-Stunden-Tagen nicht falsch', () => {
  assert.equal(berlinDaysBetween('2026-08-01T12:00:00Z', '2026-08-08T12:00:00Z'), 7)
  assert.equal(berlinDaysBetween('2026-10-24T12:00:00Z', '2026-10-26T12:00:00Z'), 2)
  assert.equal(berlinDaysBetween('2026-03-28T12:00:00Z', '2026-03-30T12:00:00Z'), 2)
})

test('berlinHour für die Begrüßung und die Cron-Fenster', () => {
  assert.equal(berlinHour(new Date('2026-08-07T22:30:00Z')), 0)
  assert.equal(berlinHour(new Date('2026-08-08T15:00:00Z')), 17)
  assert.equal(berlinHour(new Date('2026-01-15T15:00:00Z')), 16)
})

test('Formularwert und Speicherung sind zueinander invers', () => {
  assert.equal(toBerlinInputValue(new Date('2026-08-07T22:30:00Z')), '2026-08-08T00:30')
  assert.equal(fromBerlinInputValue('2026-08-08T00:30').toISOString(), '2026-08-07T22:30:00.000Z')
  for (const v of ['2026-08-08T00:30', '2026-03-29T12:00', '2026-10-25T23:59', '2026-12-31T23:00']) {
    assert.equal(toBerlinInputValue(fromBerlinInputValue(v)), v, `Roundtrip ${v}`)
  }
})

test('Nur-Datum-Parameter wird als Berliner Tagesanfang gelesen', () => {
  assert.equal(fromBerlinInputValue('2026-08-08').toISOString(), '2026-08-07T22:00:00.000Z')
})

test('isIsoDay nimmt echte Datumsangaben an', () => {
  assert.equal(isIsoDay('2026-08-24'), true)
  assert.equal(isIsoDay('2026-01-01'), true)
  assert.equal(isIsoDay('1999-12-31'), true)
})

test('isIsoDay weist alles andere ab', () => {
  // Der Ernstfall: Eine kaputte Regex ohne Backslashes würde "dddd-dd-dd"
  // annehmen und echte Daten ablehnen. Genau so fiel der Betreuungszeitraum
  // still aus – die Seite sah aus, als gäbe es gar keinen.
  assert.equal(isIsoDay('dddd-dd-dd'), false)
  assert.equal(isIsoDay('24.08.2026'), false)
  assert.equal(isIsoDay('2026-8-4'), false)
  assert.equal(isIsoDay('2026-08-24T10:00'), false)
  assert.equal(isIsoDay(''), false)
  assert.equal(isIsoDay(null), false)
  assert.equal(isIsoDay(undefined), false)
  assert.equal(isIsoDay(20260824), false)
})

test('isIsoDay und fromBerlinInputValue passen zusammen', () => {
  // Was die Prüfung durchlässt, muss auch ein gültiges Datum ergeben
  for (const v of ['2026-08-24', '2026-03-29', '2026-10-25', '2025-12-31']) {
    assert.equal(isIsoDay(v), true, v)
    assert.ok(!Number.isNaN(fromBerlinInputValue(v).getTime()), `${v} ergibt ein gültiges Datum`)
  }
})

test('Silvester 23:30 gehört noch ins alte Jahr', () => {
  const sylvester = fromBerlinWallClock(2025, 12, 31, 23, 30)
  assert.equal(sylvester.toISOString(), '2025-12-31T22:30:00.000Z')
  assert.equal(berlinYear(sylvester), 2025)
  // Umgekehrt: 00:30 Berliner Zeit am 1.1. ist in UTC noch der 31.12.
  assert.equal(berlinYear(new Date('2025-12-31T23:30:00Z')), 2026)
})

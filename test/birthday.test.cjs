const { test } = require('node:test')
const assert = require('node:assert/strict')
const { birthdayInfo } = require('../.test-build/birthday')

// Mittags UTC, damit die Berliner Tagesgrenze nicht zufällig getroffen wird
const at = (iso) => new Date(`${iso}T12:00:00Z`)

test('Joschi: 16.08.2024, heute 09.08.2026 – wird in 7 Tagen zwei', () => {
  const i = birthdayInfo('2024-08-16', at('2026-08-09'))
  assert.equal(i.isToday, false)
  assert.equal(i.wasYesterday, false)
  assert.equal(i.currentAge, 1)
  assert.equal(i.daysUntil, 7)
  assert.equal(i.age, 2)
})

test('am Geburtstag selbst', () => {
  const i = birthdayInfo('2024-08-16', at('2026-08-16'))
  assert.equal(i.isToday, true)
  assert.equal(i.wasYesterday, false)
  assert.equal(i.currentAge, 2)
  assert.equal(i.daysUntil, 0)
})

test('am Tag danach – dann zeigt das Dashboard den Rückblick', () => {
  const i = birthdayInfo('2024-08-16', at('2026-08-17'))
  assert.equal(i.isToday, false)
  assert.equal(i.wasYesterday, true)
  assert.equal(i.age, 2)
})

test('zwei Tage danach ist die Karte wieder weg', () => {
  const i = birthdayInfo('2024-08-16', at('2026-08-18'))
  assert.equal(i.isToday, false)
  assert.equal(i.wasYesterday, false)
})

test('Bella: 08.04.2024 – am 09.08.2026 zwei Jahre alt', () => {
  const i = birthdayInfo('2024-04-08', at('2026-08-09'))
  assert.equal(i.currentAge, 2)
  assert.equal(i.age, 3)
  assert.equal(i.daysUntil, 242)
})

test('Berliner Tagesgrenze statt UTC', () => {
  // 22:30 UTC am 15.08. = 00:30 Berliner Zeit am 16.08. → Geburtstag
  assert.equal(birthdayInfo('2024-08-16', new Date('2026-08-15T22:30:00Z')).isToday, true)
  // 21:30 UTC = 23:30 Berliner Zeit am 15.08. → noch nicht
  assert.equal(birthdayInfo('2024-08-16', new Date('2026-08-15T21:30:00Z')).isToday, false)
})

test('Jahreswechsel: Geburtstag am 1. Januar, heute Silvester', () => {
  const i = birthdayInfo('2024-01-01', at('2026-12-31'))
  assert.equal(i.daysUntil, 1)
  assert.equal(i.currentAge, 2)
  assert.equal(i.age, 3)
})

test('Silvester-Geburtstag am Neujahrstag zählt als gestern', () => {
  // Dieser Fall war ein echter Fehler: "war gestern" prüfte nur den
  // diesjährigen Geburtstag, hier liegt gestern aber im Vorjahr.
  const i = birthdayInfo('2024-12-31', at('2027-01-01'))
  assert.equal(i.wasYesterday, true)
  assert.equal(i.currentAge, 2)
  assert.equal(i.age, 2)
})

test('29. Februar wird im Nicht-Schaltjahr am 1. März gefeiert', () => {
  assert.equal(birthdayInfo('2024-02-29', at('2026-03-01')).isToday, true)
  assert.equal(birthdayInfo('2024-02-29', at('2026-02-28')).isToday, false)
  assert.equal(birthdayInfo('2024-02-29', at('2028-02-29')).isToday, true)
})

test('ohne Geburtstag kommt null zurück', () => {
  assert.equal(birthdayInfo(null), null)
  assert.equal(birthdayInfo(''), null)
})

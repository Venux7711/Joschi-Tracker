const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  TECHNIKEN, technikFuer, satzGeruest, gleicheForm,
  hatAnker, letzteAnfaenge, tagesAnweisung,
} = require('../.test-build/humor')

// Die echten Sätze aus dem Befund, der diese Datei ausgelöst hat
const ECHTE_SAETZE = [
  'Ich stehe auf den Fliesen. Es zieht.',
  'Ich stehe auf dem Tisch. Das reicht als Plan.',
  'Ich putze mich. Das reicht als Programm.',
  'Ich liege flach. Der Teppich ist weich.',
]

test('die Formgleichheit der echten Sätze wird erkannt', () => {
  // Der eigentliche Anlass: Vier Sätze, dieselbe Form, unterschiedliche Wörter.
  // Die Prüfung auf Wortüberschneidung fand das nicht.
  assert.equal(gleicheForm(ECHTE_SAETZE[1], [ECHTE_SAETZE[0]]), true)
  assert.equal(gleicheForm('Ich stehe im Flur. Kalt.', ECHTE_SAETZE), true)
})

test('eine andere Satzform kommt durch', () => {
  assert.equal(gleicheForm('Passt.', ECHTE_SAETZE), false)
  assert.equal(gleicheForm('Sie räumt schon wieder auf.', ECHTE_SAETZE), false)
  assert.equal(gleicheForm('Das war nicht abgesprochen.', ECHTE_SAETZE), false)
})

test('das Gerüst erfasst Anfang und Länge, nicht den Inhalt', () => {
  // Gleicher Anfang, gleiche Längenklasse = gleiche Form
  assert.equal(
    satzGeruest('Ich stehe auf dem Tisch.').split('|')[0],
    satzGeruest('Ich stehe auf den Fliesen.').split('|')[0],
  )
  // Anderer Anfang = andere Form
  assert.notEqual(
    satzGeruest('Ich stehe auf dem Tisch.').split('|')[0],
    satzGeruest('Sie räumt schon wieder auf.').split('|')[0],
  )
})

test('ein leerer Verlauf blockiert nichts', () => {
  assert.equal(gleicheForm('Irgendein Satz.', []), false)
  assert.equal(gleicheForm('', ECHTE_SAETZE), false)
})

test('die Technik ist pro Tag stabil', () => {
  // Beim Neuladen und beim Würfeln muss dieselbe herauskommen, sonst wäre
  // nichts nachvollziehbar
  assert.equal(technikFuer('2026-09-01').key, technikFuer('2026-09-01').key)
})

test('aufeinanderfolgende Tage bekommen verschiedene Techniken', () => {
  const tage = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
  const keys = tage.map(t => technikFuer(t).key)
  for (let i = 1; i < keys.length; i++) {
    assert.notEqual(keys[i], keys[i - 1], `${tage[i]} wie ${tage[i - 1]}`)
  }
})

test('über zwei Wochen kommen mehrere Techniken vor', () => {
  const keys = new Set()
  for (let i = 1; i <= 14; i++) {
    keys.add(technikFuer(`2026-09-${String(i).padStart(2, '0')}`).key)
  }
  assert.ok(keys.size >= 4, `nur ${keys.size} verschiedene`)
})

test('der Versatz erzwingt eine andere Technik', () => {
  // Grundlage für den zweiten Anlauf, wenn der erste dieselbe Form hatte
  assert.notEqual(technikFuer('2026-09-01', 0).key, technikFuer('2026-09-01', 3).key)
})

test('jede Technik hat Anweisung und Beispiel', () => {
  // Ohne Beispiel bleibt eine Anweisung abstrakt – genau daran ist die erste
  // Fassung der Rollenbeschreibung gescheitert.
  for (const t of TECHNIKEN) {
    assert.ok(t.anweisung.length > 20, t.key)
    assert.ok(t.beispiel.length > 5, t.key)
  }
  assert.equal(new Set(TECHNIKEN.map(t => t.key)).size, TECHNIKEN.length)
})

test('ein Anker macht den Satz unverwechselbar', () => {
  // Der Test aus dem Auftrag: Könnte das über jede beliebige Katze stehen?
  assert.equal(hatAnker('Ich liege flach. Der Teppich ist weich.', ['nautilus', 'külsheim']), false)
  assert.equal(hatAnker('Schon wieder Nautilus.', ['nautilus', 'külsheim']), true)
  assert.equal(hatAnker('Zweimal. Das reicht.', []), true, 'Zahlen sind Anker')
})

test('sehr kurze Anker zählen nicht', () => {
  // Sonst gilt jeder Satz mit "der" darin als verankert
  assert.equal(hatAnker('Der Platz war frei.', ['der']), false)
})

test('die Satzanfänge der letzten Tage werden gesammelt', () => {
  const anfaenge = letzteAnfaenge(ECHTE_SAETZE)
  assert.ok(anfaenge.includes('ich stehe'), JSON.stringify(anfaenge))
  // Doppelte nur einmal
  assert.equal(new Set(anfaenge).size, anfaenge.length)
})

test('die Tagesanweisung nennt Technik und verbrauchte Anfänge', () => {
  const text = tagesAnweisung(technikFuer('2026-09-01'), ECHTE_SAETZE)
  assert.ok(text.includes('TECHNIK FÜR HEUTE'), text)
  assert.ok(text.includes('ich stehe'), text)
  assert.ok(text.includes('Fang anders an'), text)
})

test('ohne Verlauf steht kein Hinweis auf Satzanfänge darin', () => {
  const text = tagesAnweisung(technikFuer('2026-09-01'), [])
  assert.ok(text.includes('TECHNIK FÜR HEUTE'))
  assert.ok(!text.includes('ZULETZT BENUTZTE'), text)
})

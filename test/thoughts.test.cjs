const { test } = require('node:test')
const assert = require('node:assert/strict')
const { leseAntwort, teileDialog, ersatzGedanken, beschreibeTag } = require('../.test-build/thoughts')

const tag = {
  datum: '30. August',
  wochentag: 'Samstag',
  futter: [{ name: 'Nautilus Ragout', mal: 3 }],
  befinden: [],
  fotos: { anzahl: 4, ersteUhrzeit: '08:12', letzteUhrzeit: '19:14', ort: 'Nürnberg' },
  menschen: [],
  besonderes: [],
}

test('sauberes JSON wird gelesen', () => {
  const r = leseAntwort('{"joschi":"A","bella":"B","beide":"Joschi: A | Bella: B"}')
  assert.equal(r.joschi, 'A')
  assert.equal(r.bella, 'B')
})

test('JSON im Codeblock wird trotzdem gelesen', () => {
  // Modelle rahmen ihre Antwort gern ein, obwohl der Prompt es ausschließt.
  // Deswegen deshalb auf den Ersatztext zurückzufallen wäre Verschwendung.
  const r = leseAntwort('```json\n{"joschi":"A","bella":"B","beide":"C"}\n```')
  assert.equal(r.joschi, 'A')
})

test('Geschwätz vor und nach dem JSON stört nicht', () => {
  const r = leseAntwort('Klar, hier: {"joschi":"A","bella":"B","beide":"C"} Viel Spaß!')
  assert.equal(r.bella, 'B')
})

test('unbrauchbare Antworten ergeben null – dann greift der Ersatz', () => {
  assert.equal(leseAntwort('Ich kann das leider nicht.'), null)
  assert.equal(leseAntwort(''), null)
  assert.equal(leseAntwort('{kaputt'), null)
  assert.equal(leseAntwort('{"joschi":"","bella":"  "}'), null)
})

test('nur teilweise gefüllte Antworten liefern, was da ist', () => {
  // Ein halb gelungener Durchlauf soll nicht alles verwerfen
  const r = leseAntwort('{"joschi":"A"}')
  assert.equal(r.joschi, 'A')
  assert.equal(r.bella, undefined)
})

test('der Dialog wird in zwei Sprechblasen zerlegt', () => {
  const teile = teileDialog('Joschi: Es gab Ente. | Bella: Heul doch.')
  assert.equal(teile.length, 2)
  assert.deepEqual(teile[0], { wer: 'Joschi', was: 'Es gab Ente.' })
  assert.deepEqual(teile[1], { wer: 'Bella', was: 'Heul doch.' })
})

test('ein Dialog mit Doppelpunkt im Satz bleibt heil', () => {
  const teile = teileDialog('Joschi: Mein Urteil: mittelmäßig. | Bella: Wie immer.')
  assert.equal(teile[0].was, 'Mein Urteil: mittelmäßig.')
})

test('hält auch ein abweichendes Format aus', () => {
  // Ohne Namen davor darf nichts verlorengehen – lieber ohne Zuordnung
  // anzeigen als den Satz wegwerfen.
  const teile = teileDialog('Einfach nur ein Satz.')
  assert.equal(teile.length, 1)
  assert.equal(teile[0].wer, '')
  assert.equal(teile[0].was, 'Einfach nur ein Satz.')
})

test('der Ersatz nennt immer etwas Konkretes aus dem Tag', () => {
  const e = ersatzGedanken(tag)
  assert.ok(e.joschi.includes('Nautilus Ragout'), e.joschi)
  assert.ok(e.bella.includes('4'), e.bella)
  // Der Dialog muss zerlegbar bleiben, sonst bricht die Darstellung
  assert.equal(teileDialog(e.beide).length, 2)
})

test('der Ersatz kommt auch mit einem leeren Tag zurecht', () => {
  const leer = { ...tag, futter: [], fotos: { anzahl: 0, ersteUhrzeit: null, letzteUhrzeit: null, ort: null } }
  const e = ersatzGedanken(leer)
  assert.ok(e.joschi.length > 0)
  assert.ok(e.bella.length > 0)
  assert.equal(teileDialog(e.beide).length, 2)
})

test('kein Eintrag wird als "war alles gut" beschrieben, nicht als Lücke', () => {
  // Die Hausregel: Befinden wird nur bei Auffälligkeit erfasst. Ohne diesen
  // Hinweis dichtet die KI eine Vernachlässigung hinein.
  const text = beschreibeTag(tag)
  assert.ok(text.includes('keine Auffälligkeiten'), text)
  assert.ok(!text.includes('nicht eingetragen') || text.includes('Futter'), text)
})

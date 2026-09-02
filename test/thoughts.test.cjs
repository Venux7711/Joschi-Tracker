const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  leseAntwort, teileDialog, ersatzGedanken, beschreibeTag,
  zeitraumAnweisung, istZeitraum, ZEITRAEUME,
} = require('../.test-build/thoughts')

const tag = {
  datum: '30. August',
  wochentag: 'Samstag',
  futter: [{ name: 'Nautilus Ragout', mal: 3 }],
  befinden: [],
  fotos: { anzahl: 4, ersteUhrzeit: '08:12', letzteUhrzeit: '19:14', ort: 'Nürnberg' },
  menschen: [],
  besonderes: [],
}

test('mehrere Vorschläge je Stimme werden gelesen', () => {
  const r = leseAntwort(JSON.stringify({
    joschi: [
      { text: 'A', ansatz: 'status', bild: 2 },
      { text: 'B', ansatz: 'absurd', bild: 1 },
    ],
    bella: [{ text: 'C', ansatz: 'kontrast', bild: 1 }],
  }))
  assert.equal(r.joschi.length, 2)
  assert.equal(r.joschi[0].text, 'A')
  assert.equal(r.joschi[0].premisse, 'status')
  assert.equal(r.joschi[0].bild, 2)
  assert.equal(r.bella.length, 1)
})

test('das frühere Format mit einem Satz je Stimme geht weiter', () => {
  // Ein Modell fällt gelegentlich in ein einfacheres Format zurück. Deshalb
  // einen ganzen Tag zu verlieren wäre unverhältnismäßig.
  const r = leseAntwort('{"joschi":"A","bella":"B","beide":"Joschi: A | Bella: B"}')
  assert.equal(r.joschi.length, 1)
  assert.equal(r.joschi[0].text, 'A')
  assert.equal(r.joschi[0].premisse, null)
})

test('ein unbekannter Ansatz wird verworfen, der Satz nicht', () => {
  const r = leseAntwort('{"joschi":[{"text":"A","ansatz":"quatsch"}]}')
  assert.equal(r.joschi[0].text, 'A')
  assert.equal(r.joschi[0].premisse, null)
})

test('fehlende Bildnummer ist kein Fehler', () => {
  const r = leseAntwort('{"joschi":[{"text":"A"}]}')
  assert.equal(r.joschi[0].text, 'A')
  assert.equal(r.joschi[0].bild, null)
})

test('Bildnummer als Text wird trotzdem verstanden', () => {
  // Modelle liefern gern "1" statt 1. Deswegen das passende Bild neben dem
  // Satz zu verlieren wäre Verschwendung.
  const r = leseAntwort('{"joschi":[{"text":"A","bild":"3"}]}')
  assert.equal(r.joschi[0].bild, 3)
})

test('unsinnige Bildnummern werden verworfen', () => {
  for (const wert of ['0', '-2', '1.5', 'zwei', 'null']) {
    const r = leseAntwort('{"joschi":[{"text":"A","bild":"' + wert + '"}]}')
    assert.equal(r.joschi[0].bild, null, wert)
  }
})

test('JSON im Codeblock wird trotzdem gelesen', () => {
  // Modelle rahmen ihre Antwort gern ein, obwohl der Prompt es ausschließt.
  // Deswegen deshalb auf den Ersatztext zurückzufallen wäre Verschwendung.
  const r = leseAntwort('```json\n{"joschi":"A","bella":"B","beide":"C"}\n```')
  assert.equal(r.joschi[0].text, 'A')
})

test('Geschwätz vor und nach dem JSON stört nicht', () => {
  const r = leseAntwort('Klar, hier: {"joschi":"A","bella":"B","beide":"C"} Viel Spaß!')
  assert.equal(r.bella[0].text, 'B')
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
  assert.equal(r.joschi[0].text, 'A')
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

test('die Anweisung regelt, wer aus welcher Perspektive spricht', () => {
  // Der Befund: Auf einem Foto sitzt Joschi vor dem laufenden Fernseher und
  // schaut weg – Bella sagte dazu "Der Fernseher läuft, ich schaue lieber
  // weg". Sie war nicht dabei. Wer nicht auf dem Bild ist, redet über die
  // andere, nicht an ihrer Stelle.
  const { SYSTEM_PROMPT } = require('../.test-build/thoughts')
  assert.ok(SYSTEM_PROMPT.includes('WER IST AUF DEM BILD'), 'Abschnitt fehlt')
  assert.ok(SYSTEM_PROMPT.includes('Er schaut trotzdem weg.'), 'das richtige Beispiel fehlt')
  assert.ok(SYSTEM_PROMPT.includes('Ich schaue lieber weg.'), 'das falsche Beispiel fehlt')
})

// ── Zeiträume ───────────────────────────────────────────────────

const woche = {
  ...tag,
  spanne: {
    tage: 7,
    vonBis: 'Mi, 26. August bis Di, 1. September',
    verlauf: [
      { wochentag: 'Mittwoch', datum: '26. August', futter: ['Nautilus Ragout'], fotos: 3 },
      { wochentag: 'Donnerstag', datum: '27. August', futter: [], fotos: 0 },
      { wochentag: 'Freitag', datum: '28. August', futter: ['Huhn Deluxe'], fotos: 2 },
    ],
  },
}

test('istZeitraum nimmt nur die bekannten Zeiträume an', () => {
  for (const z of ZEITRAEUME) assert.equal(istZeitraum(z), true)
  assert.equal(istZeitraum('jahrzehnt'), false)
  assert.equal(istZeitraum(null), false)
})

test('ein Tag beschreibt sich als Tag, ein Zeitraum als Zeitraum', () => {
  assert.ok(beschreibeTag(tag).startsWith('Tag:'), beschreibeTag(tag))
  assert.ok(beschreibeTag(woche).startsWith('Zeitraum:'), beschreibeTag(woche))
})

test('der Verlauf über die Tage steht mit im Text', () => {
  // Aus "14× Nautilus" wird kein Rückblick, aus "an vier Tagen dasselbe,
  // dann nicht mehr" schon. Die Verteilung muss also mitgeliefert werden.
  const text = beschreibeTag(woche)
  assert.ok(text.includes('VERLAUF ÜBER DIE TAGE'), text)
  assert.ok(text.includes('Donnerstag, 27. August: nichts eingetragen'), text)
  assert.ok(text.includes('keine Fotos'), text)
})

test('das Tagesfenster bekommt keine Zusatzanweisung', () => {
  assert.equal(zeitraumAnweisung('tag'), '')
})

test('die Wochenanweisung hebt den Tagesauftrag ausdrücklich auf', () => {
  // Der Grundtext beginnt mit "du kommentierst deinen gestrigen Tag". Ohne
  // Widerspruch schreibt das Modell auch über sieben Tage einen Tagessatz.
  const text = zeitraumAnweisung('woche')
  assert.ok(text.includes('EINE WOCHE, KEIN TAG'), text)
  assert.ok(text.includes('Vergiss den Satz oben'), text)
  // Das Fazit kommt ohne Bildnummer – sonst wäre der Rückblick wieder
  // ein Satz über ein einzelnes Foto.
  assert.ok(text.includes('"bild": 0'), text)
  // Und die Aufzählung ist ausdrücklich verboten
  assert.ok(text.toLowerCase().includes('aufzählung'), text)
})

test('die Monatsanweisung verlangt den langen Bogen, keine Episode', () => {
  const text = zeitraumAnweisung('monat')
  assert.ok(text.includes('EIN MONAT, KEIN TAG'), text)
  assert.ok(text.includes('geblieben ist'), text)
  assert.ok(text.includes('"bild": 0'), text)
})

test('die Damals-Anweisung verbietet erfundene Veränderungen', () => {
  const text = zeitraumAnweisung('damals')
  assert.ok(text.includes('EIN ALTER TAG'), text)
  assert.ok(text.includes('ERINNERUNGEN'), text)
  assert.ok(text.includes('"bild": 0'), text)
})

test('ein Fazit trägt Bild 0 und wird als bildlos gelesen', () => {
  // So kommt das Fazit ohne eigenes Antwortformat aus: bild 0 ist keine
  // gültige Bildnummer und wird zu null.
  const gelesen = leseAntwort(JSON.stringify({
    joschi: [{ text: 'Sieben Tage, kein einziger Fehler.', ansatz: 'status', bild: 0 }],
  }))
  assert.equal(gelesen.joschi[0].bild, null)
})

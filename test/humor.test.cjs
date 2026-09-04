const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  PREMISSEN, istPremisse, VERBOTEN, verboteneSprache,
  satzGeruest, gleicheForm, zuAehnlich, hatAnker, letzteAnfaenge,
  bewerte, waehleBesten, tagesAnweisung, redetUeberSich, hatIchForm,
} = require('../.test-build/humor')

// Die echten Sätze aus dem Befund, der den Umbau ausgelöst hat
const ECHTE_SAETZE = [
  'Ich stehe auf den Fliesen. Es zieht.',
  'Ich stehe auf dem Tisch. Das reicht als Plan.',
  'Ich putze mich. Das reicht als Programm.',
  'Ich liege flach. Der Teppich ist weich.',
]

const kontext = (ueber) => ({
  anker: ['nautilus', 'külsheim', 'joschi', 'bella'],
  letzteSaetze: [],
  letztePremissen: [],
  zielLaenge: 12,
  ...ueber,
})

const kand = (ueber) => ({ text: 'Der Karton ist zu klein für Nautilus.', premisse: 'untertreibung', bild: 1, ...ueber })

// ── Verbotene Sprache ────────────────────────────────────────────────────

test('Kinderhumor wird abgelehnt, nicht abgewogen', () => {
  // Als Prüfung und nicht nur als Bitte im Prompt: Eine Anweisung wird
  // gelegentlich ignoriert, eine Ablehnung nie.
  for (const wort of ['Miau', 'meine Fellnase', 'kleine Flauschkugel', 'der Dosenöffner', 'typisch Katze']) {
    assert.ok(verboteneSprache(wort), wort)
  }
})

test('Emojis und Ausrufezeichen fliegen raus', () => {
  assert.equal(verboteneSprache('Ich liege hier 😼'), 'Emoji')
  assert.equal(verboteneSprache('Das war mein Platz!'), 'Ausrufezeichen')
})

test('normale Sätze kommen durch', () => {
  assert.equal(verboteneSprache('Der Karton ist zu klein. Ich bleibe trotzdem.'), null)
  assert.equal(verboteneSprache('Das war nicht abgesprochen.'), null)
})

test('ein verbotenes Wort macht den Kandidaten wertlos', () => {
  const b = bewerte(kand({ text: 'Meine Fellnase liegt auf dem Nautilus.' }), kontext())
  assert.equal(b.punkte, -Infinity)
  assert.ok(b.abgelehnt.includes('fellnase'), b.abgelehnt)
})

// ── Spezifität ───────────────────────────────────────────────────────────

test('austauschbare Sätze verlieren gegen konkrete', () => {
  // Der Test aus der Vorgabe: Könnte das in jeder Katzen-App stehen?
  const konkret = bewerte(kand({ text: 'Schon wieder Nautilus.' }), kontext())
  const generisch = bewerte(kand({ text: 'Ich liege gern warm.' }), kontext())
  assert.ok(konkret.punkte > generisch.punkte)
  assert.ok(generisch.gruende.includes('austauschbar'))
})

test('Mengenangaben zählen als konkret', () => {
  // Die Anweisung rät von Ziffern ab, also stehen Mengen ausgeschrieben da
  assert.equal(hatAnker('Zweimal. Das reicht.', []), true)
  assert.equal(hatAnker('Ich liege flach.', []), false)
})

// ── Wiederholung ─────────────────────────────────────────────────────────

test('die Formgleichheit der echten Sätze wird erkannt', () => {
  // Der eigentliche Anlass: dieselbe Form, andere Wörter. Eine Wortprüfung
  // findet das nie – "Plan" und "Programm" haben nichts gemeinsam.
  assert.equal(gleicheForm(ECHTE_SAETZE[1], [ECHTE_SAETZE[0]]), true)
  assert.equal(gleicheForm('Passt.', ECHTE_SAETZE), false)
})

test('gleiche Form kostet Punkte', () => {
  const k = kontext({ letzteSaetze: ECHTE_SAETZE })
  const alt = bewerte(kand({ text: 'Ich stehe im Flur. Nautilus fehlt.' }), k)
  const neu = bewerte(kand({ text: 'Nautilus. Wieder.' }), k)
  assert.ok(neu.punkte > alt.punkte)
  assert.ok(alt.gruende.some(g => g.includes('Satzform')))
})

test('wörtliche Wiederholung kostet mehr als Formgleichheit', () => {
  const k = kontext({ letzteSaetze: ['Sie hat meinen Platz genommen.'] })
  const b = bewerte(kand({ text: 'Sie hat meinen Platz wieder genommen.' }), k)
  assert.ok(b.gruende.some(g => g.includes('wörtlich')))
})

// ── Abwechslung ohne Kalender ────────────────────────────────────────────

test('derselbe Ansatz wie gestern muss stärker sein', () => {
  // Der Kern des Umbaus: Abwechslung entsteht aus der Bewertung, nicht aus
  // einer festen Rotation über den Kalender.
  const k = kontext({ letztePremissen: ['status', 'kontrast'] })
  const gestern = bewerte(kand({ premisse: 'status' }), k)
  const frisch = bewerte(kand({ premisse: 'absurd' }), k)
  assert.ok(frisch.punkte > gestern.punkte)
  assert.ok(gestern.gruende.some(g => g.includes('gestern')))
})

test('ein Ansatz von vor Wochen ist wieder frei', () => {
  const k = kontext({ letztePremissen: ['kontrast', 'absurd', 'menschen', 'beobachtung', 'status'] })
  const b = bewerte(kand({ premisse: 'status' }), k)
  assert.ok(!b.gruende.some(g => g.includes('gestern')), JSON.stringify(b.gruende))
})

test('ein Rückgriff auf die Geschichte wird belohnt', () => {
  // Ein Callback ist mehr wert als ein neuer Witz – er funktioniert nur mit
  // der gemeinsamen Geschichte.
  const mit = bewerte(kand({ premisse: 'rueckgriff' }), kontext())
  const ohne = bewerte(kand({ premisse: 'beobachtung' }), kontext())
  assert.ok(mit.punkte > ohne.punkte)
})

test('ein Vorschlag ohne benannte Situation wird abgewertet', () => {
  const mit = bewerte(kand({ premisse: 'status' }), kontext())
  const ohne = bewerte(kand({ premisse: null }), kontext())
  assert.ok(mit.punkte > ohne.punkte)
})

// ── Stil ─────────────────────────────────────────────────────────────────

test('zu lange Sätze werden abgewertet', () => {
  const lang = 'Ich habe heute den ganzen Tag darüber nachgedacht was Nautilus eigentlich bedeutet und bin dabei zu keinem abschließenden Ergebnis gekommen weil es einfach viel zu viele Aspekte gibt.'
  assert.ok(bewerte(kand({ text: lang }), kontext()).gruende.includes('zu lang'))
})

test('erklärte Pointen werden abgewertet', () => {
  const b = bewerte(kand({ text: 'Nautilus war da. Das ist jetzt ironisch.' }), kontext())
  assert.ok(b.gruende.some(g => g.includes('erklärt')))
})

test('geschwollene Sprache wird abgewertet', () => {
  const b = bewerte(kand({ text: 'Nautilus von erstaunlicher Belanglosigkeit.' }), kontext())
  assert.ok(b.gruende.some(g => g.includes('geschwollen')))
})

// ── Auswahl ──────────────────────────────────────────────────────────────

test('aus mehreren Vorschlägen gewinnt der beste', () => {
  const gewinner = waehleBesten([
    { text: 'Ich liege gern warm.', premisse: 'beobachtung', bild: 1 },
    { text: 'Schon wieder Nautilus. Ich sage nichts.', premisse: 'rueckgriff', bild: 2 },
    { text: 'Miau.', premisse: 'status', bild: 1 },
  ], kontext())

  assert.ok(gewinner.kandidat.text.includes('Nautilus'), gewinner.kandidat.text)
  assert.equal(gewinner.kandidat.bild, 2)
})

test('sind alle Vorschläge unbrauchbar, wird nichts gewählt', () => {
  // Dann greift der Ersatz – lieber ein schlichter Satz als "Fellnase"
  const ergebnis = waehleBesten([
    { text: 'Miau miau.', premisse: 'status', bild: 1 },
    { text: 'Meine Fellnase 😼', premisse: 'absurd', bild: 1 },
  ], kontext())
  assert.equal(ergebnis, null)
})

test('ohne Vorschläge kommt null zurück', () => {
  assert.equal(waehleBesten([], kontext()), null)
})

test('die Bewertung nennt ihre Gründe', () => {
  // Damit im Protokoll steht, warum ein Satz gewonnen hat
  const b = bewerte(kand({ text: 'Schon wieder Nautilus.' }), kontext())
  assert.ok(Array.isArray(b.gruende))
  assert.ok(b.gruende.includes('konkret'))
})

// ── Ansätze ──────────────────────────────────────────────────────────────

test('die Ansatzarten sind eindeutig', () => {
  assert.equal(new Set(PREMISSEN).size, PREMISSEN.length)
  assert.ok(PREMISSEN.length >= 6)
})

test('istPremisse nimmt nur bekannte Ansätze an', () => {
  assert.equal(istPremisse('status'), true)
  assert.equal(istPremisse('quatsch'), false)
  assert.equal(istPremisse(null), false)
  assert.equal(istPremisse(42), false)
})

test('die Tagesanweisung verlangt einen Vorschlag je Bild', () => {
  // Seit die Karte zu jedem Bild seinen eigenen Satz zeigt, muss auch je Bild
  // einer entstehen. Ein Satz am falschen Bild macht die Karte kaputt.
  const text = tagesAnweisung(ECHTE_SAETZE, ['status'])
  assert.ok(text.includes('einen Vorschlag zu jedem beiliegenden Bild'), text)
  assert.ok(text.includes('falschen Bild'), text)
  assert.ok(text.includes('ich stehe'), 'verbrauchte Satzanfänge fehlen')
  assert.ok(text.includes('wer darauf markiert ist'), text)
  assert.ok(text.includes('status'), 'verbrauchte Ansätze fehlen')
  // Und ausdrücklich keine Kalender-Vorgabe mehr
  assert.ok(text.includes('nicht der Kalender'), text)
})

test('ohne Verlauf steht kein Hinweis auf Verbrauchtes darin', () => {
  const text = tagesAnweisung([], [])
  assert.ok(!text.includes('ZULETZT BENUTZTE'), text)
})

test('die Satzanfänge der letzten Tage werden gesammelt', () => {
  const anfaenge = letzteAnfaenge(ECHTE_SAETZE)
  assert.ok(anfaenge.includes('ich stehe'), JSON.stringify(anfaenge))
  assert.equal(new Set(anfaenge).size, anfaenge.length)
})

test('das Gerüst erfasst Anfang und Länge, nicht den Inhalt', () => {
  assert.equal(
    satzGeruest('Ich stehe auf dem Tisch.').split('|')[0],
    satzGeruest('Ich stehe auf den Fliesen.').split('|')[0],
  )
})

test('ein leerer Verlauf blockiert nichts', () => {
  assert.equal(gleicheForm('Irgendein Satz.', []), false)
  assert.equal(zuAehnlich('Irgendein Satz.', []), false)
})

// ── Wer redet über wen ──────────────────────────────────────────

test('eine Stimme redet nicht über sich in der dritten Form', () => {
  // Der Befund: Unter Bella stand ein Satz, in dem über Bella geredet wurde.
  // Die Karte schreibt den Satz aber Bella zu und stellt ihn neben ihr Bild.
  assert.equal(redetUeberSich('Bella liegt auf dem Sofa.', 'Bella'), 'Bella')
  assert.equal(redetUeberSich('Ich liege auf dem Sofa.', 'Bella'), null)
})

test('über die andere Katze zu reden ist erlaubt', () => {
  assert.equal(redetUeberSich('Joschi sitzt schon wieder davor.', 'Bella'), null)
})

test('im Zwiegespräch wird jede Hälfte für sich geprüft', () => {
  // Der Name vor dem Doppelpunkt gehört zur Form, nicht zum Satz.
  assert.equal(redetUeberSich('Joschi: Ich sage nichts. | Bella: Er sagt nie was.'), null)
  assert.equal(redetUeberSich('Joschi: Joschi sagt nichts. | Bella: Passt.'), 'Joschi')
  assert.equal(redetUeberSich('Joschi: Bella lag da. | Bella: Stimmt.'), null)
})

test('ohne bekannten Sprecher wird nichts abgelehnt', () => {
  assert.equal(redetUeberSich('Bella lag auf dem Sofa.'), null)
  assert.equal(redetUeberSich('Bella lag auf dem Sofa.', null), null)
})

test('die Bewertung lehnt den Satz hart ab, nicht nur mit Abzug', () => {
  const b = bewerte(kand({ text: 'Bella liegt auf dem Nautilus.' }), { ...kontext(), sprecher: 'Bella' })
  assert.equal(b.punkte, -Infinity)
  assert.ok(b.abgelehnt.includes('dritten Form'), b.abgelehnt)
})

test('die Anweisung verbietet die dritte Form über sich selbst', () => {
  const { SYSTEM_PROMPT } = require('../.test-build/thoughts')
  assert.ok(SYSTEM_PROMPT.includes('immer in der Ich-Form'), 'Regel fehlt')
  assert.ok(SYSTEM_PROMPT.includes('Bella liegt auf dem Sofa'), 'Gegenbeispiel fehlt')
})

test('die Ich-Form wird an Wortgrenzen erkannt', () => {
  assert.equal(hatIchForm('Ich bleibe hier.'), true)
  assert.equal(hatIchForm('Der Napf ist meiner.'), true)
  assert.equal(hatIchForm('Wir bewachen das Fenster.'), true)
  assert.equal(hatIchForm('Er liegt auf dem Ofen.'), false)
  // Ohne Wortgrenzen fände "wir" auch in "Wirbel" und "mir" in "Mirabelle"
  assert.equal(hatIchForm('Ein Wirbel aus Staub.'), false)
  assert.equal(hatIchForm('Die Mirabelle liegt am Boden.'), false)
})

test('steht nur die Stimme selbst auf dem Bild, ist die dritte Form falsch', () => {
  // Der gemeldete Befund. Grundlage ist, was das Modell selbst gesehen hat,
  // nicht die Markierung in der Datenbank – die war nachweislich schon
  // falsch: Auf dem Ofen-Foto stand Bella, zu sehen war Joschi.
  const k = { ...kontext(), sprecher: 'Joschi', verlangtIchForm: true }
  const dritte = bewerte(kand({ text: 'Er liegt auf dem Nautilus.' }), k)
  assert.equal(dritte.punkte, -Infinity)
  assert.ok(dritte.abgelehnt.includes('dritte Form'), dritte.abgelehnt)

  const erste = bewerte(kand({ text: 'Ich liege auf dem Nautilus.' }), k)
  assert.ok(erste.punkte > 0)
})

test('ist die Lage nicht eindeutig, wird nichts verlangt', () => {
  // Sind beide zu sehen oder hat das Modell nichts erkannt, kostet eine
  // Ablehnung dem Bild nur seinen Satz.
  const b = bewerte(kand({ text: 'Er liegt auf dem Nautilus.' }), { ...kontext(), sprecher: 'Joschi' })
  assert.ok(b.punkte > 0)
})

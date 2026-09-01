const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  waehleRelevante, bewerte, gagGesperrt, zuAehnlich, alsText,
  GAG_SPERRE_TAGE, HOECHSTENS,
} = require('../.test-build/memory/select')
const { zuKandidaten, leseBeobachtungen, brauchbar } = require('../.test-build/memory/observe')

const mem = (ueber) => ({
  id: 'm1',
  subjectType: 'cat',
  subjectId: 'joschi-id',
  memoryType: 'pattern',
  title: 'sofa',
  description: 'Joschi liegt häufig auf dem Sofa',
  evidence: { fotoIds: [], tage: [] },
  sourcePhotoIds: [],
  confidence: 0.6,
  occurrenceCount: 5,
  firstSeenAt: '2026-06-01',
  lastSeenAt: '2026-08-30',
  status: 'active',
  source: 'beobachtung',
  ...ueber,
})

const kontext = (ueber) => ({
  themen: [], katzen: [], zusammen: false, tag: '2026-09-01', zuletztVerwendet: {}, ...ueber,
})

test('nur Gesichertes darf in einen Gedanken einfließen', () => {
  // Die Regel, die verhindert, dass ein einzelnes Foto zur Behauptung wird
  const auswahl = waehleRelevante([
    mem({ id: 'a', status: 'tentative' }),
    mem({ id: 'b', status: 'stale' }),
    mem({ id: 'c', status: 'superseded' }),
    mem({ id: 'd', status: 'active' }),
  ], kontext())
  assert.equal(auswahl.length, 1)
  assert.equal(auswahl[0].id, 'd')
})

test('was zum heutigen Tag passt, gewinnt deutlich', () => {
  const passend = mem({ id: 'karton', title: 'roter karton', memoryType: 'observation', confidence: 0.3, occurrenceCount: 3 })
  const unpassend = mem({ id: 'sofa', title: 'sofa', memoryType: 'preference', confidence: 0.9, occurrenceCount: 20 })

  const ohneBezug = waehleRelevante([passend, unpassend], kontext())
  assert.equal(ohneBezug[0].id, 'sofa')

  // Steht heute ein Karton auf dem Foto, schlägt er die stärker belegte Vorliebe
  const mitBezug = waehleRelevante([passend, unpassend], kontext({ themen: ['roter karton'] }))
  assert.equal(mitBezug[0].id, 'karton')
})

test('ein Running Gag ruht nach Verwendung', () => {
  const gag = mem({ id: 'g', memoryType: 'running_gag', title: 'karton' })

  const frisch = kontext({ zuletztVerwendet: { g: '2026-08-30' } })
  assert.equal(gagGesperrt(gag, frisch), true)
  assert.equal(waehleRelevante([gag], frisch).length, 0)

  const lange = kontext({ zuletztVerwendet: { g: '2026-07-01' } })
  assert.equal(gagGesperrt(gag, lange), false)
  assert.equal(waehleRelevante([gag], lange).length, 1)
})

test('die Sperre gilt nur für Gags, nicht für Vorlieben', () => {
  // Eine Vorliebe darf jeden Tag mitschwingen. Eine Pointe nicht.
  const vorliebe = mem({ id: 'v', memoryType: 'preference' })
  assert.equal(gagGesperrt(vorliebe, kontext({ zuletztVerwendet: { v: '2026-08-31' } })), false)
})

test('die Sperre greift genau an der gesetzten Grenze', () => {
  const gag = mem({ id: 'g', memoryType: 'running_gag' })
  const tageVorher = (n) => {
    const d = new Date('2026-09-01T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }
  assert.equal(gagGesperrt(gag, kontext({ zuletztVerwendet: { g: tageVorher(GAG_SPERRE_TAGE - 1) } })), true)
  assert.equal(gagGesperrt(gag, kontext({ zuletztVerwendet: { g: tageVorher(GAG_SPERRE_TAGE) } })), false)
})

test('Meilensteine stehen über Alltagsbeobachtungen', () => {
  const meilenstein = mem({ id: 'm', memoryType: 'milestone', confidence: 0.4, occurrenceCount: 1 })
  const alltag = mem({ id: 'a', memoryType: 'observation', confidence: 0.9, occurrenceCount: 15 })
  assert.ok(bewerte(meilenstein, kontext()) > bewerte(alltag, kontext()))
})

test('es fließen höchstens sechs Erinnerungen ein', () => {
  // Bei dreißig im Text sucht sich ein Modell die auffälligste heraus,
  // nicht die passende.
  const viele = Array.from({ length: 30 }, (_, i) => mem({ id: `m${i}`, title: `platz-${i}` }))
  assert.equal(waehleRelevante(viele, kontext()).length, HOECHSTENS)
})

test('kürzlich Verwendetes rutscht nach hinten', () => {
  const frisch = mem({ id: 'frisch' })
  const lange = mem({ id: 'lange' })
  const k = kontext({ zuletztVerwendet: { frisch: '2026-08-31', lange: '2026-06-01' } })
  assert.ok(bewerte(lange, k) > bewerte(frisch, k))
})

test('dieselbe Pointe in anderen Worten wird erkannt', () => {
  // Der Fall, um den es geht: "Ich wurde ignoriert" in fünf Varianten
  assert.equal(zuAehnlich(
    'Sie hat meinen Platz genommen.',
    ['Sie hat meinen Platz wieder genommen.'],
  ), true)

  assert.equal(zuAehnlich(
    'Zweimal Fisch. Vernünftig.',
    ['Sie hat meinen Platz genommen.'],
  ), false)
})

test('kurze Füllwörter erzeugen keine falsche Ähnlichkeit', () => {
  // Ohne die Längenfilterung ähnelt jeder deutsche Satz jedem anderen
  assert.equal(zuAehnlich(
    'Ich lag den ganzen Tag dort.',
    ['Sie war heute oft am Fenster.'],
  ), false)
})

test('ein leerer Verlauf blockiert nichts', () => {
  assert.equal(zuAehnlich('Irgendein Satz.', []), false)
  assert.equal(zuAehnlich('', ['Etwas']), false)
})

test('Erinnerungen werden mit Zahlen formuliert', () => {
  // "6× beobachtet, seit Juni" ist die Grundlage für Wörter wie "inzwischen"
  const text = alsText([mem({ occurrenceCount: 6 })], { 'joschi-id': 'Joschi' })
  assert.ok(text.includes('Joschi'), text)
  assert.ok(text.includes('6×'), text)
  assert.ok(text.includes('2026-06-01'), text)
})

test('wiederkehrende Themen werden als solche gekennzeichnet', () => {
  const text = alsText([mem({ memoryType: 'running_gag' })], {})
  assert.ok(text.includes('wiederkehrendes Thema'), text)
})

test('ohne Erinnerungen steht das auch so da', () => {
  assert.ok(alsText([], {}).includes('Noch keine'))
})

// ── Beobachtungen ────────────────────────────────────────────────────────

test('zu allgemeine Beobachtungen werden verworfen', () => {
  // Ein Modell antwortet auf "welche Objekte" gern mit "Boden" oder "Fell".
  // Daraus einen Running Gag wachsen zu lassen wäre absurd.
  for (const wert of ['boden', 'wand', 'fell', 'katze', 'objekt', 'nichts']) {
    assert.equal(brauchbar(wert), false, wert)
  }
  assert.equal(brauchbar('roter karton'), true)
  assert.equal(brauchbar('fensterbrett'), true)
})

test('ganze Sätze sind keine Beobachtung', () => {
  assert.equal(brauchbar('die katze liegt auf dem sofa und schläft'), false)
  assert.equal(brauchbar('ab'), false)
})

test('eine Katzen-Beobachtung ohne zuzuordnende Katze fällt weg', () => {
  // Sie ließe sich später keiner Stimme zuordnen
  const k = zuKandidaten(
    [{ subjectType: 'cat', katze: 'Mimi', art: 'platz', wert: 'sofa', fotoId: 'f1', tag: '2026-09-01' }],
    { joschi: 'joschi-id' },
    '2026-09-01',
  )
  assert.equal(k.length, 0)
})

test('Katzennamen werden auf ihre Kennung abgebildet', () => {
  const k = zuKandidaten(
    [{ subjectType: 'cat', katze: 'Joschi', art: 'platz', wert: 'sofa', fotoId: 'f1', tag: '2026-09-01' }],
    { joschi: 'joschi-id' },
    '2026-09-01',
  )
  assert.equal(k.length, 1)
  assert.equal(k[0].subjectId, 'joschi-id')
  assert.equal(k[0].memoryType, 'observation')
})

test('Beobachtungen aus der Bildanalyse werden streng gelesen', () => {
  const b = leseBeobachtungen([
    { bild: 1, katze: 'Joschi', platz: 'Sofa', aktivitaet: 'schläft', objekte: ['roter Karton', 'Boden'] },
    { bild: 2, katze: 'beide', platz: 'Fensterbrett' },
    { bild: 99, katze: 'Bella', platz: 'Sessel' },
    'kaputt',
    null,
  ], ['foto-a', 'foto-b'], '2026-09-01')

  // "Boden" ist rausgeflogen, "roter karton" nicht
  const objekte = b.filter(x => x.art === 'objekt').map(x => x.wert)
  assert.deepEqual(objekte, ['roter karton'])

  // Die Bildnummer wird auf die echte Foto-Kennung abgebildet
  assert.equal(b.find(x => x.art === 'platz' && x.wert === 'sofa').fotoId, 'foto-a')

  // Eine Nummer, die es nicht gibt, ergibt kein Foto – aber die Beobachtung bleibt
  assert.equal(b.find(x => x.wert === 'sessel').fotoId, null)

  // "beide" wird als Paar erkannt, nicht als Katze namens "beide"
  assert.ok(b.some(x => x.subjectType === 'pair' && x.art === 'zusammen'))
})

test('unbrauchbare Modellantworten ergeben keine Beobachtungen', () => {
  assert.deepEqual(leseBeobachtungen(null, [], '2026-09-01'), [])
  assert.deepEqual(leseBeobachtungen('text', [], '2026-09-01'), [])
  assert.deepEqual(leseBeobachtungen([{}], [], '2026-09-01'), [])
})

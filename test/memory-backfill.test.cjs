const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ausHistorie, verbindeMitBestand } = require('../.test-build/memory/backfill')

const KATZEN = [
  { id: 'joschi-id', name: 'Joschi' },
  { id: 'bella-id', name: 'Bella' },
]

const foto = (ueber) => ({
  id: 'f1', taken_at: '2026-06-01T12:00:00Z', place: null,
  cat_ids: ['joschi-id'], cat_id: null, ...ueber,
})

/** n Fotos an n verschiedenen Tagen, sonst gleich. */
const anTagen = (anzahl, ueber = {}) =>
  Array.from({ length: anzahl }, (_, i) => foto({
    id: `f${i}`,
    taken_at: `2026-06-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    ...ueber,
  }))

const finde = (memories, titel) => memories.find(m => m.title === titel)

test('ein Ort an drei Tagen wird zum Muster', () => {
  const m = finde(ausHistorie(anTagen(3, { place: 'Sofa' }), [], KATZEN), 'sofa')
  assert.ok(m, 'Muster fehlt')
  assert.equal(m.memoryType, 'pattern')
  assert.equal(m.occurrenceCount, 3)
  assert.equal(m.status, 'active')
  assert.equal(m.subjectId, 'joschi-id')
})

test('zwei Tage reichen nicht', () => {
  // Dieselbe Vorsicht wie im täglichen Betrieb: Zweimal kann Zufall sein.
  assert.equal(finde(ausHistorie(anTagen(2, { place: 'Sofa' }), [], KATZEN), 'sofa'), undefined)
})

test('aus vielen Tagen wird eine Vorliebe', () => {
  const m = finde(ausHistorie(anTagen(10, { place: 'Fensterbrett' }), [], KATZEN), 'fensterbrett')
  assert.equal(m.memoryType, 'preference')
  assert.equal(m.occurrenceCount, 10)
})

test('zwanzig Fotos an einem Tag sind ein Tag', () => {
  // Wer an einem Nachmittag zwanzig Mal fotografiert wird, war einmal dort.
  const fotos = Array.from({ length: 20 }, (_, i) =>
    foto({ id: `f${i}`, taken_at: '2026-06-01T12:00:00Z', place: 'Sofa' }))
  assert.equal(finde(ausHistorie(fotos, [], KATZEN), 'sofa'), undefined)
})

test('Zuversicht steigt mit den Tagen, bleibt aber unter eins', () => {
  const wenig = finde(ausHistorie(anTagen(3, { place: 'Sofa' }), [], KATZEN), 'sofa')
  const viel = finde(ausHistorie(anTagen(20, { place: 'Sofa' }), [], KATZEN), 'sofa')
  assert.ok(viel.confidence > wenig.confidence)
  assert.ok(viel.confidence <= 0.9, String(viel.confidence))
})

test('das erste Foto jeder Katze ist ein Meilenstein', () => {
  const memories = ausHistorie([
    foto({ id: 'spaet', taken_at: '2026-07-01T12:00:00Z' }),
    foto({ id: 'frueh', taken_at: '2026-06-01T12:00:00Z' }),
  ], [], KATZEN)

  const m = finde(memories, 'erstes foto von joschi')
  assert.equal(m.memoryType, 'milestone')
  assert.deepEqual(m.sourcePhotoIds, ['frueh'])
  assert.equal(m.firstSeenAt, '2026-06-01')
  // Bella hat keine Fotos – dann auch keinen Meilenstein
  assert.equal(finde(memories, 'erstes foto von bella'), undefined)
})

test('gemeinsame Fotos ergeben Beziehung und ein erstes Mal', () => {
  const memories = ausHistorie([
    foto({ id: 'a', taken_at: '2026-06-10T12:00:00Z', cat_ids: ['joschi-id', 'bella-id'] }),
    foto({ id: 'b', taken_at: '2026-06-20T12:00:00Z', cat_ids: ['joschi-id', 'bella-id'] }),
  ], [], KATZEN)

  const beziehung = finde(memories, 'gemeinsam auf einem foto')
  assert.equal(beziehung.memoryType, 'relationship')
  assert.equal(beziehung.subjectType, 'pair')
  assert.equal(beziehung.occurrenceCount, 2)

  const erstes = finde(memories, 'erstmals gemeinsam auf einem foto')
  assert.equal(erstes.memoryType, 'milestone')
  assert.equal(erstes.firstSeenAt, '2026-06-10')
  assert.deepEqual(erstes.sourcePhotoIds, ['a'])
})

test('ohne gemeinsame Fotos wird keine Beziehung behauptet', () => {
  const memories = ausHistorie(anTagen(5, { place: 'Sofa' }), [], KATZEN)
  assert.equal(finde(memories, 'gemeinsam auf einem foto'), undefined)
  assert.equal(finde(memories, 'erstmals gemeinsam auf einem foto'), undefined)
})

test('alte Fotos mit nur einer Katzenspalte zählen mit', () => {
  const fotos = anTagen(3, { place: 'Sofa', cat_ids: null, cat_id: 'joschi-id' })
  assert.equal(finde(ausHistorie(fotos, [], KATZEN), 'sofa').occurrenceCount, 3)
})

test('Futtersorten werden nach Tagen gezählt und gehören dem Haushalt', () => {
  const fuetterungen = Array.from({ length: 6 }, (_, i) => ({
    logged_at: `2026-06-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
    food_brand: 'Anifit', food_type: 'Nautilus Ragout',
  }))
  const m = finde(ausHistorie([], fuetterungen, KATZEN), 'futter nautilus ragout')
  assert.equal(m.subjectType, 'household')
  assert.equal(m.subjectId, null)
  assert.equal(m.occurrenceCount, 6)
})

test('selten gefütterte Sorten landen nicht im Gedächtnis', () => {
  const fuetterungen = Array.from({ length: 4 }, (_, i) => ({
    logged_at: `2026-06-0${i + 1}T08:00:00Z`,
    food_brand: 'Anifit', food_type: 'Ente',
  }))
  assert.equal(finde(ausHistorie([], fuetterungen, KATZEN), 'futter ente'), undefined)
})

test('leere Historie ergibt leeres Gedächtnis, keinen Fehler', () => {
  assert.deepEqual(ausHistorie([], [], KATZEN), [])
  assert.deepEqual(ausHistorie([], [], []), [])
})

test('Fotos ohne Ort erzeugen keine Ortserinnerung', () => {
  const memories = ausHistorie(anTagen(5, { place: null }), [], KATZEN)
  assert.equal(memories.filter(m => m.memoryType === 'pattern').length, 0)
})

// ── Zusammenführen mit dem Bestand ───────────────────────────────────────

const bestehend = (ueber) => ({
  subjectType: 'cat', subjectId: 'joschi-id', memoryType: 'pattern',
  title: 'sofa', description: 'alt', evidence: { fotoIds: [], tage: [] },
  sourcePhotoIds: [], confidence: 0.5, occurrenceCount: 5,
  firstSeenAt: '2026-06-01', lastSeenAt: '2026-06-05',
  status: 'active', source: 'beobachtung', ...ueber,
})

test('eine Nutzerkorrektur wird von der Ableitung nicht überschrieben', () => {
  // Auch dann nicht, wenn die Historie etwas anderes nahelegt
  const abgeleitet = ausHistorie(anTagen(20, { place: 'Sofa' }), [], KATZEN)
  const uebrig = verbindeMitBestand(abgeleitet, [bestehend({ source: 'nutzer' })])
  assert.equal(uebrig.find(m => m.title === 'sofa'), undefined)
})

test('ein besser belegter Bestand wird nicht kleingerechnet', () => {
  // Das tägliche Gedächtnis kennt auch die Bildanalyse, die Ableitung nur Fotos
  const abgeleitet = ausHistorie(anTagen(3, { place: 'Sofa' }), [], KATZEN)
  const uebrig = verbindeMitBestand(abgeleitet, [bestehend({ occurrenceCount: 9 })])
  assert.equal(uebrig.find(m => m.title === 'sofa'), undefined)
})

test('eine reichere Ableitung ersetzt einen dünnen Bestand', () => {
  const abgeleitet = ausHistorie(anTagen(12, { place: 'Sofa' }), [], KATZEN)
  const uebrig = verbindeMitBestand(abgeleitet, [bestehend({ occurrenceCount: 2 })])
  assert.equal(uebrig.find(m => m.title === 'sofa').occurrenceCount, 12)
})

test('Unbekanntes kommt immer durch', () => {
  const abgeleitet = ausHistorie(anTagen(4, { place: 'Kratzbaum' }), [], KATZEN)
  assert.equal(verbindeMitBestand(abgeleitet, []).length, abgeleitet.length)
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  verschmelze, veralte, widersprich, korrigiere,
  SICHER_AB, HALTBARKEIT_TAGE,
} = require('../.test-build/memory/merge')
const { schluessel, normalisiere } = require('../.test-build/memory/types')

const kandidat = (ueber) => ({
  subjectType: 'cat',
  subjectId: 'joschi-id',
  memoryType: 'observation',
  title: 'sofa',
  description: 'Joschi auf dem Platz „sofa"',
  fotoIds: ['f1'],
  tag: '2026-09-01',
  ...ueber,
})

/** Wendet mehrere Tage nacheinander an – so entsteht der Bestand wie im Betrieb. */
function ueberTage(tage) {
  let bestand = []
  for (const [tag, kandidaten] of tage) {
    for (const a of verschmelze(bestand, kandidaten.map(k => ({ ...k, tag })), tag)) {
      const s = schluessel(a.memory)
      const pos = bestand.findIndex(m => schluessel(m) === s)
      if (pos >= 0) bestand[pos] = a.memory
      else bestand.push(a.memory)
    }
  }
  return bestand
}

test('etwas einmal Gesehenes ist noch kein Wissen', () => {
  // Die wichtigste Regel überhaupt: Ein einzelnes Foto darf nicht zu
  // "Joschi liebt das Sofa" führen.
  const [a] = verschmelze([], [kandidat()], '2026-09-01')
  assert.equal(a.art, 'neu')
  assert.equal(a.memory.status, 'tentative')
  assert.equal(a.memory.occurrenceCount, 1)
  assert.ok(a.memory.confidence < 0.3)
})

test('erst Wiederholung macht daraus Wissen', () => {
  const bestand = ueberTage([
    ['2026-09-01', [kandidat()]],
    ['2026-09-02', [kandidat()]],
    ['2026-09-03', [kandidat()]],
  ])
  assert.equal(bestand.length, 1)
  assert.equal(bestand[0].occurrenceCount, SICHER_AB)
  assert.equal(bestand[0].status, 'active')
  // Aus der Beobachtung ist ein Muster geworden
  assert.equal(bestand[0].memoryType, 'pattern')
})

test('aus einem Muster wird mit der Zeit eine Vorliebe', () => {
  const tage = []
  for (let i = 1; i <= 9; i++) {
    tage.push([`2026-09-${String(i).padStart(2, '0')}`, [kandidat()]])
  }
  const bestand = ueberTage(tage)
  assert.equal(bestand[0].memoryType, 'preference')
  assert.equal(bestand[0].occurrenceCount, 9)
})

test('mehrere Fotos an einem Tag zählen als ein Vorkommnis', () => {
  // Wer auf drei Fotos desselben Tages auf dem Sofa liegt, war einmal auf
  // dem Sofa. Ohne diese Regel wäre nach einer Fotoserie sofort alles "sicher".
  const [a] = verschmelze([], [
    kandidat({ fotoIds: ['f1'] }),
    kandidat({ fotoIds: ['f2'] }),
    kandidat({ fotoIds: ['f3'] }),
  ], '2026-09-01')
  assert.equal(a.memory.occurrenceCount, 1)
  assert.deepEqual(a.memory.evidence.fotoIds.sort(), ['f1', 'f2', 'f3'])
})

test('derselbe Tag zweimal verarbeitet zählt nicht doppelt', () => {
  // Passiert bei jedem Neuwürfeln. Ohne diese Prüfung würde ein Nutzer, der
  // fünfmal würfelt, sich fünf Vorkommnisse erzeugen.
  const bestand = ueberTage([['2026-09-01', [kandidat()]]])
  const [a] = verschmelze(bestand, [kandidat()], '2026-09-01')
  assert.equal(a.art, 'unveraendert')
  assert.equal(a.memory.occurrenceCount, 1)
})

test('Zuversicht wächst, aber mit abnehmendem Ertrag', () => {
  const tage = []
  for (let i = 1; i <= 20; i++) tage.push([`2026-09-${String(i).padStart(2, '0')}`, [kandidat()]])
  const bestand = ueberTage(tage)
  assert.ok(bestand[0].confidence > 0.7, String(bestand[0].confidence))
  // Nie ganz sicher: Es bleibt eine Beobachtung, keine Messung.
  assert.ok(bestand[0].confidence < 1)
})

test('Titel werden vereinheitlicht, damit nichts doppelt entsteht', () => {
  assert.equal(normalisiere('  Der   KARTON '), 'der karton')
  const bestand = ueberTage([
    ['2026-09-01', [kandidat({ title: 'Der Karton' })]],
    ['2026-09-02', [kandidat({ title: 'der  karton' })]],
  ])
  assert.equal(bestand.length, 1)
  assert.equal(bestand[0].occurrenceCount, 2)
})

test('verschiedene Katzen bekommen getrennte Erinnerungen', () => {
  const bestand = ueberTage([
    ['2026-09-01', [kandidat({ subjectId: 'joschi-id' }), kandidat({ subjectId: 'bella-id' })]],
  ])
  assert.equal(bestand.length, 2)
})

test('was lange nichts von sich hören lässt, verblasst', () => {
  const bestand = ueberTage([
    ['2026-01-01', [kandidat()]],
    ['2026-01-02', [kandidat()]],
    ['2026-01-03', [kandidat()]],
  ])
  assert.equal(bestand[0].status, 'active')

  const spaeter = veralte(bestand, '2026-12-31')
  assert.equal(spaeter[0].status, 'stale')
})

test('Ereignisse und Meilensteine verblassen nie', () => {
  // "Erstmals zusammen geschlafen" ist passiert. Das bleibt wahr, egal wie
  // lange es her ist.
  assert.equal(HALTBARKEIT_TAGE.event, null)
  assert.equal(HALTBARKEIT_TAGE.milestone, null)

  const ereignis = {
    subjectType: 'pair', subjectId: null, memoryType: 'event',
    title: 'erstmals zusammen', description: null,
    evidence: { fotoIds: [], tage: ['2024-01-01'] }, sourcePhotoIds: [],
    confidence: 0.8, occurrenceCount: 1,
    firstSeenAt: '2024-01-01', lastSeenAt: '2024-01-01',
    status: 'active', source: 'beobachtung',
  }
  assert.equal(veralte([ereignis], '2026-12-31')[0].status, 'active')
})

test('ein verblasstes Thema wird durch Wiederkehr wieder aktiv', () => {
  // Genau das macht einen Running Gag nach langer Pause wieder komisch.
  let bestand = ueberTage([
    ['2026-01-01', [kandidat()]],
    ['2026-01-02', [kandidat()]],
    ['2026-01-03', [kandidat()]],
  ])
  bestand = veralte(bestand, '2026-12-01')
  assert.equal(bestand[0].status, 'stale')

  const [a] = verschmelze(bestand, [kandidat()], '2026-12-02')
  assert.equal(a.art, 'verstaerkt')
  assert.equal(a.memory.status, 'active')
})

test('Widerspruch senkt die Zuversicht, löscht aber nichts', () => {
  const bestand = ueberTage([
    ['2026-09-01', [kandidat()]],
    ['2026-09-02', [kandidat()]],
    ['2026-09-03', [kandidat()]],
  ])
  const vorher = bestand[0].confidence
  const nachher = widersprich(bestand[0])
  assert.ok(nachher.confidence < vorher)
  assert.equal(nachher.title, bestand[0].title)
})

test('genug Widerspruch lässt eine Erinnerung verblassen', () => {
  let m = ueberTage([['2026-09-01', [kandidat()]]])[0]
  for (let i = 0; i < 5; i++) m = widersprich(m)
  assert.equal(m.status, 'stale')
  assert.equal(m.confidence, 0)
})

test('eine Nutzerkorrektur wiegt schwerer als jede Beobachtung', () => {
  const bestand = ueberTage([['2026-09-01', [kandidat()]]])
  const korrigiert = korrigiere(bestand[0], 'Fensterbrett', 'Mag Bella gar nicht', '2026-09-05')

  assert.equal(korrigiert.source, 'nutzer')
  assert.equal(korrigiert.confidence, 1)
  assert.equal(korrigiert.status, 'active')

  // Und sie lässt sich weder abwerten noch vom Zeitablauf widerrufen
  assert.equal(widersprich(korrigiert).confidence, 1)
  assert.equal(veralte([korrigiert], '2027-12-31')[0].status, 'active')
})

test('eine Nutzerkorrektur wird durch Beobachtung nicht umgeschrieben', () => {
  const bestand = ueberTage([['2026-09-01', [kandidat()]]])
  const korrigiert = korrigiere(bestand[0], 'sofa', 'Vom Menschen festgestellt', '2026-09-05')

  const [a] = verschmelze([korrigiert], [kandidat()], '2026-09-06')
  assert.equal(a.memory.confidence, 1)
  assert.equal(a.memory.source, 'nutzer')
  // Der Zähler darf steigen, die Art nicht wechseln
  assert.equal(a.memory.occurrenceCount, 2)
  assert.equal(a.memory.memoryType, 'observation')
})

test('der Beleg wächst mit, bleibt aber begrenzt', () => {
  const tage = []
  for (let i = 1; i <= 30; i++) {
    const tag = `2026-09-${String(i).padStart(2, '0')}`
    tage.push([tag, [kandidat({ fotoIds: [`foto-${i}`] })]])
  }
  const bestand = ueberTage(tage)
  assert.equal(bestand[0].occurrenceCount, 30)
  // Belege sind Beispiele, keine vollständige Akte
  assert.ok(bestand[0].evidence.fotoIds.length <= 12)
  assert.ok(bestand[0].evidence.tage.length <= 40)
  // Das jüngste Vorkommnis muss dabei sein
  assert.equal(bestand[0].evidence.tage[0], '2026-09-30')
})

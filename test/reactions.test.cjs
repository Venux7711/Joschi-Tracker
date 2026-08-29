const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isReaction, REACTIONS, EMOJI_GRUPPEN } = require('../.test-build/reactions')

test('die Schnellauswahl ist gültig', () => {
  for (const e of REACTIONS) assert.equal(isReaction(e), true, e)
})

test('jedes Emoji aus der vollen Auswahl kommt auch durch die Prüfung', () => {
  // Der wichtigste Test hier: Was die Oberfläche anbietet, muss der Server
  // annehmen. Sonst tippt man auf ein Emoji und nichts passiert.
  for (const gruppe of EMOJI_GRUPPEN) {
    for (const e of gruppe.emojis) {
      assert.equal(isReaction(e), true, `${gruppe.titel}: ${e}`)
    }
  }
})

test('zusammengesetzte Emojis werden nicht zerrissen', () => {
  assert.equal(isReaction('👍🏽'), true, 'mit Hautton')
  assert.equal(isReaction('👨‍👩‍👧'), true, 'Familie mit Verbindern')
  assert.equal(isReaction('🐈‍⬛'), true, 'schwarze Katze')
  assert.equal(isReaction('❤️'), true, 'mit Variationszeichen')
  assert.equal(isReaction('❤'), true, 'ohne Variationszeichen')
  assert.equal(isReaction('🇩🇪'), true, 'Flagge aus zwei Buchstaben')
  assert.equal(isReaction('🏳️‍🌈'), true, 'Flagge mit Verbinder')
})

test('Text kommt nicht durch', () => {
  // Ohne diese Prüfung stünde beliebiger Text in der Reaktionsspalte und
  // würde ungeprüft angezeigt.
  assert.equal(isReaction('hallo'), false)
  assert.equal(isReaction('a'), false)
  assert.equal(isReaction('123'), false)
  assert.equal(isReaction('<script>'), false)
  assert.equal(isReaction(''), false)
  assert.equal(isReaction(' '), false)
  assert.equal(isReaction(null), false)
  assert.equal(isReaction(undefined), false)
  assert.equal(isReaction(42), false)
})

test('nur ein einzelnes Emoji, keine Ketten', () => {
  assert.equal(isReaction('❤️❤️'), false)
  assert.equal(isReaction('👍😂'), false)
  assert.equal(isReaction('👍 '), false)
  assert.equal(isReaction('👍hallo'), false)
  assert.equal(isReaction('hallo👍'), false)
})

test('übermäßig lange Ketten werden abgewiesen', () => {
  assert.equal(isReaction('👍'.repeat(20)), false)
  // Selbst das längste sinnvolle Emoji bleibt weit unter der Grenze
  assert.ok('👨‍👩‍👧‍👦'.length < 32)
})

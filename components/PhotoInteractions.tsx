'use client'

import { useEffect, useState } from 'react'
import { REACTIONS } from '@/lib/reactions'
import EmojiPicker from '@/components/EmojiPicker'

type Reaction = { id: string; photo_id: string; user_id: string; emoji: string }
type Comment = { id: string; photo_id: string; user_id: string; text: string; created_at: string }
type CommentReaction = { id: string; comment_id: string; user_id: string; emoji: string }

/**
 * Reaktionen und Kommentare zu einem Foto.
 *
 * Lädt beim Öffnen des Bildes und hält den Zustand danach lokal – bei einem
 * Tipp auf ein Emoji soll nicht erst der Server antworten müssen, bevor sich
 * etwas tut.
 */
export default function PhotoInteractions({ photoId }: { photoId: string }) {
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [commentReactions, setCommentReactions] = useState<CommentReaction[]>([])
  // Welcher Kommentar zeigt gerade seine Emoji-Auswahl? Immer alle
  // einzublenden würde die Kommentarliste zukleistern.
  const [offeneAuswahl, setOffeneAuswahl] = useState<string | null>(null)
  // Die volle Emoji-Auswahl – 'bild' für das Foto, sonst die Kommentar-Kennung
  const [pickerFuer, setPickerFuer] = useState<string | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [me, setMe] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    const load = async () => {
      const res = await fetch(`/api/photos/interactions?photoIds=${photoId}`)
      const data = await res.json().catch(() => ({}))
      if (abgebrochen || !res.ok) return
      setReactions(data.reactions ?? [])
      setComments(data.comments ?? [])
      setCommentReactions(data.commentReactions ?? [])
      setNames(data.names ?? {})
      setMe(data.me ?? null)
    }
    load()
    return () => { abgebrochen = true }
  }, [photoId])

  const nameOf = (id: string) => names[id] ?? 'Jemand'

  // Welche Emojis stehen am Bild? Die Schnellauswahl immer, dazu alles, was
  // hier schon jemand benutzt hat. Ohne das verschwände ein aus der vollen
  // Auswahl gewähltes Emoji sofort wieder aus der Knopfreihe.
  const benutzteEmojis = Array.from(new Set(reactions.map(r => r.emoji)))
  const bildEmojis = [
    ...REACTIONS,
    ...benutzteEmojis.filter(e => !(REACTIONS as readonly string[]).includes(e)),
  ]

  const toggle = async (emoji: string) => {
    if (!me) return
    const meins = reactions.find(r => r.emoji === emoji && r.user_id === me)

    // Sofort umschalten, danach bestätigen lassen
    setReactions(prev => meins
      ? prev.filter(r => r.id !== meins.id)
      : [...prev, { id: `neu-${emoji}`, photo_id: photoId, user_id: me, emoji }])

    const res = await fetch('/api/photos/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_id: photoId, type: 'reaction', emoji }),
    })
    if (!res.ok) {
      setError('Reaktion konnte nicht gespeichert werden')
      // Zurückdrehen, sonst zeigt die Anzeige etwas, das nicht gespeichert ist
      setReactions(prev => meins
        ? [...prev, meins]
        : prev.filter(r => r.id !== `neu-${emoji}`))
    }
  }

  /** Reaktion auf einen Kommentar – gleiche Logik wie beim Bild. */
  const toggleKommentar = async (commentId: string, emoji: string) => {
    if (!me) return
    const meins = commentReactions.find(
      r => r.comment_id === commentId && r.emoji === emoji && r.user_id === me,
    )

    setCommentReactions(prev => meins
      ? prev.filter(r => r.id !== meins.id)
      : [...prev, { id: `neu-${commentId}-${emoji}`, comment_id: commentId, user_id: me, emoji }])
    setOffeneAuswahl(null)

    const res = await fetch('/api/photos/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_id: photoId, type: 'comment_reaction', comment_id: commentId, emoji }),
    })
    if (!res.ok) {
      setError('Reaktion konnte nicht gespeichert werden')
      setCommentReactions(prev => meins
        ? [...prev, meins]
        : prev.filter(r => r.id !== `neu-${commentId}-${emoji}`))
    }
  }

  const senden = async () => {
    const inhalt = text.trim()
    if (!inhalt) return
    setBusy(true); setError(null)
    const res = await fetch('/api/photos/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_id: photoId, type: 'comment', text: inhalt }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Kommentar konnte nicht gespeichert werden'); return }
    setComments(prev => [...prev, data.comment])
    if (data.comment && data.name) setNames(prev => ({ ...prev, [data.comment.user_id]: data.name }))
    setText('')
  }

  const loeschen = async (id: string) => {
    const vorher = comments
    setComments(prev => prev.filter(c => c.id !== id))
    const res = await fetch('/api/photos/interactions', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    if (!res.ok) { setError('Konnte nicht gelöscht werden'); setComments(vorher) }
  }

  return (
    <div className="mt-3">
      {/* Reaktionen: Schnellauswahl, dazu alles, womit hier schon reagiert
          wurde – ein gewähltes Emoji soll nicht wieder verschwinden, nur weil
          es nicht zur festen Auswahl gehört. */}
      <div className="flex gap-1.5 flex-wrap">
        {bildEmojis.map(emoji => {
          const alle = reactions.filter(r => r.emoji === emoji)
          const meins = !!me && alle.some(r => r.user_id === me)
          return (
            <button
              key={emoji}
              onClick={() => toggle(emoji)}
              title={alle.length ? alle.map(r => nameOf(r.user_id)).join(', ') : 'Reagieren'}
              aria-label={alle.length ? `${emoji}: ${alle.map(r => nameOf(r.user_id)).join(', ')}` : `Mit ${emoji} reagieren`}
              style={{
                fontSize: 20, lineHeight: 1, minHeight: 44, padding: '0 14px',
                borderRadius: 999, border: 'none',
                background: meins ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.16)',
                color: meins ? '#1C1C1E' : 'white',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {emoji}
              {alle.length > 0 && (
                <span style={{ fontSize: 14, fontWeight: 700 }}>{alle.length}</span>
              )}
            </button>
          )
        })}
        <button
          onClick={() => setPickerFuer(pickerFuer === 'bild' ? null : 'bild')}
          aria-label="Weitere Emojis"
          title="Weitere Emojis"
          style={{
            fontSize: 20, lineHeight: 1, minHeight: 44, minWidth: 44,
            borderRadius: 999, border: 'none',
            background: 'rgba(255,255,255,0.16)', color: 'white', fontWeight: 700,
          }}
        >
          +
        </button>
      </div>

      {pickerFuer === 'bild' && (
        <EmojiPicker
          onWaehlen={emoji => { toggle(emoji); setPickerFuer(null) }}
          onSchliessen={() => setPickerFuer(null)}
        />
      )}

      {/* Wer hat womit reagiert. Der Tooltip allein reicht nicht: Auf dem
          iPhone gibt es kein Überfahren, dort wäre die Information unsichtbar. */}
      {reactions.length > 0 && (
        <div className="flex gap-x-3 gap-y-1 flex-wrap mt-2">
          {benutzteEmojis.map(emoji => (
            <span key={emoji} style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)' }}>
              {emoji}{' '}
              {reactions
                .filter(r => r.emoji === emoji)
                .map(r => (r.user_id === me ? 'du' : nameOf(r.user_id)))
                .join(', ')}
            </span>
          ))}
        </div>
      )}

      {/* Kommentare */}
      {comments.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {comments.map(c => {
            const meine = commentReactions.filter(r => r.comment_id === c.id)
            // Gleiche Emojis bündeln, damit unter einem Kommentar nicht
            // dreimal dasselbe Herz nebeneinander steht
            const gebuendelt = Array.from(new Set(meine.map(r => r.emoji)))
              .map(e => ({ emoji: e, leute: meine.filter(r => r.emoji === e) }))

            return (
              <div key={c.id}>
                {/* Der Kommentar selbst. 15px statt 13: Er steht auf einem
                    Foto, und heller Text auf wechselndem Untergrund liest sich
                    schwerer als auf einer ruhigen Fläche. */}
                <p style={{ fontSize: 15, color: 'white', lineHeight: 1.45 }}>
                  <b style={{ color: 'rgba(255,255,255,0.8)' }}>{nameOf(c.user_id)}</b>{' '}
                  {c.text}
                </p>

                {/*
                  Die Knöpfe stehen in einer eigenen Zeile und tragen ihren
                  Namen.

                  Vorher war "Reagieren" ein zwölf Pixel großes ☺+ bei 40 %
                  Deckkraft, rechts an den Text gequetscht, ohne Fläche und
                  ohne Beschriftung. Auf einem Foto war das für jemanden, der
                  nicht gut sieht, schlicht nicht vorhanden – und die Trefffläche
                  lag bei etwa vierzehn Pixeln, ein Drittel dessen, was ein
                  Finger braucht.

                  Ein Wort ist hier besser als ein Zeichen: Ein Symbol muss man
                  erraten, "Reagieren" liest man.
                */}
                <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                  <button
                    onClick={() => setOffeneAuswahl(offeneAuswahl === c.id ? null : c.id)}
                    aria-expanded={offeneAuswahl === c.id}
                    aria-label="Auf diesen Kommentar reagieren"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 14, fontWeight: 600, lineHeight: 1,
                      // 44 Pixel ist das Maß, unter dem ein Finger anfängt
                      // danebenzutippen.
                      minHeight: 44, padding: '0 16px', borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.25)',
                      background: offeneAuswahl === c.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.16)',
                      color: offeneAuswahl === c.id ? '#1C1C1E' : 'white',
                    }}
                  >
                    <span style={{ fontSize: 17 }}>🙂</span>
                    Reagieren
                  </button>

                  {c.user_id === me && (
                    // Sichtbar, aber ruhiger als "Reagieren": Ein Kommentar
                    // ist schnell gelöscht und kommt nicht zurück.
                    <button
                      onClick={() => loeschen(c.id)}
                      aria-label="Diesen Kommentar löschen"
                      style={{
                        fontSize: 13, lineHeight: 1, minHeight: 44, padding: '0 14px',
                        borderRadius: 999, border: 'none',
                        background: 'transparent', color: 'rgba(255,255,255,0.65)',
                      }}
                    >
                      Löschen
                    </button>
                  )}
                </div>

                {/* Auswahl nur für den angetippten Kommentar */}
                {offeneAuswahl === c.id && (
                  <>
                    {/* Die Auswahl selbst war mit 15 Pixeln und fünf Pixeln
                        Rand kaum größer als der Knopf, der sie öffnet. Ein
                        Emoji ist ein Bild – es darf groß sein. */}
                    <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 8 }}>
                      {REACTIONS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => toggleKommentar(c.id, emoji)}
                          aria-label={`Mit ${emoji} reagieren`}
                          style={{
                            fontSize: 24, lineHeight: 1, minHeight: 46, minWidth: 46,
                            borderRadius: 999, border: 'none',
                            background: 'rgba(255,255,255,0.16)',
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        onClick={() => setPickerFuer(pickerFuer === c.id ? null : c.id)}
                        aria-label="Weitere Emojis"
                        style={{
                          fontSize: 22, lineHeight: 1, minHeight: 46, minWidth: 46,
                          borderRadius: 999, border: 'none',
                          background: 'rgba(255,255,255,0.16)',
                          color: 'white', fontWeight: 700,
                        }}
                      >
                        +
                      </button>
                    </div>
                    {pickerFuer === c.id && (
                      <EmojiPicker
                        onWaehlen={emoji => { toggleKommentar(c.id, emoji); setPickerFuer(null) }}
                        onSchliessen={() => setPickerFuer(null)}
                      />
                    )}
                  </>
                )}

                {/* Was schon dransteht – antippen nimmt die eigene zurück */}
                {gebuendelt.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 6 }}>
                    {gebuendelt.map(({ emoji, leute }) => {
                      const meins = !!me && leute.some(r => r.user_id === me)
                      return (
                        <button
                          key={emoji}
                          onClick={() => toggleKommentar(c.id, emoji)}
                          aria-label={`${emoji}: ${leute.map(r => (r.user_id === me ? 'du' : nameOf(r.user_id))).join(', ')}`}
                          style={{
                            fontSize: 17, lineHeight: 1, minHeight: 38, padding: '0 12px',
                            borderRadius: 999,
                            border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                            background: meins ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.16)',
                            color: meins ? '#1C1C1E' : 'white',
                          }}
                        >
                          {emoji}
                          <span style={{ fontWeight: 600, fontSize: 13 }}>
                            {leute.map(r => (r.user_id === me ? 'du' : nameOf(r.user_id))).join(', ')}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden() } }}
          placeholder="Kommentieren…"
          maxLength={500}
          style={{
            // 16 Pixel ist nicht nur besser lesbar: Darunter zoomt Safari auf
            // dem iPhone beim Antippen ins Feld hinein und der Rest der Seite
            // rutscht weg.
            flex: 1, fontSize: 16, minHeight: 44, padding: '0 14px', borderRadius: 12,
            border: 'none',
            background: 'rgba(255,255,255,0.15)', color: 'white', outline: 'none',
          }}
        />
        <button
          onClick={senden}
          disabled={!text.trim() || busy}
          style={{
            fontSize: 15, fontWeight: 700, minHeight: 44, padding: '0 18px',
            borderRadius: 12, border: 'none', flexShrink: 0,
            background: text.trim() ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.16)',
            color: text.trim() ? '#1C1C1E' : 'rgba(255,255,255,0.6)',
          }}
        >
          {busy ? '…' : 'Senden'}
        </button>
      </div>

      {error && <p style={{ fontSize: 14, color: '#FECACA', marginTop: 8 }}>⚠ {error}</p>}
    </div>
  )
}

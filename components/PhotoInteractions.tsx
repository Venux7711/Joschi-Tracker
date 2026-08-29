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
                fontSize: 15, lineHeight: 1, padding: '7px 10px', borderRadius: 999, border: 'none',
                background: meins ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.14)',
                color: meins ? '#1C1C1E' : 'white',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {emoji}
              {alle.length > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700 }}>{alle.length}</span>
              )}
            </button>
          )
        })}
        <button
          onClick={() => setPickerFuer(pickerFuer === 'bild' ? null : 'bild')}
          aria-label="Weitere Emojis"
          title="Weitere Emojis"
          style={{
            fontSize: 15, lineHeight: 1, padding: '7px 11px', borderRadius: 999, border: 'none',
            background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.75)', fontWeight: 700,
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
            <span key={emoji} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
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
                <div className="flex items-start gap-2">
                  <span style={{ fontSize: 13, color: 'white', lineHeight: 1.4 }}>
                    <b style={{ color: 'rgba(255,255,255,0.75)' }}>{nameOf(c.user_id)}</b>{' '}
                    {c.text}
                  </span>
                  <button
                    onClick={() => setOffeneAuswahl(offeneAuswahl === c.id ? null : c.id)}
                    style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', flexShrink: 0, marginLeft: 'auto' }}
                    aria-label="Auf diesen Kommentar reagieren"
                    title="Reagieren"
                  >
                    ☺+
                  </button>
                  {c.user_id === me && (
                    <button
                      onClick={() => loeschen(c.id)}
                      style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}
                      title="Kommentar löschen"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Auswahl nur für den angetippten Kommentar */}
                {offeneAuswahl === c.id && (
                  <>
                    <div className="flex gap-1 flex-wrap mt-1.5">
                      {REACTIONS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => toggleKommentar(c.id, emoji)}
                          style={{
                            fontSize: 15, lineHeight: 1, padding: '5px 8px', borderRadius: 999,
                            border: 'none', background: 'rgba(255,255,255,0.14)',
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        onClick={() => setPickerFuer(pickerFuer === c.id ? null : c.id)}
                        aria-label="Weitere Emojis"
                        style={{
                          fontSize: 15, lineHeight: 1, padding: '5px 9px', borderRadius: 999,
                          border: 'none', background: 'rgba(255,255,255,0.14)',
                          color: 'rgba(255,255,255,0.75)', fontWeight: 700,
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
                  <div className="flex gap-1 flex-wrap mt-1">
                    {gebuendelt.map(({ emoji, leute }) => {
                      const meins = !!me && leute.some(r => r.user_id === me)
                      return (
                        <button
                          key={emoji}
                          onClick={() => toggleKommentar(c.id, emoji)}
                          aria-label={`${emoji}: ${leute.map(r => (r.user_id === me ? 'du' : nameOf(r.user_id))).join(', ')}`}
                          style={{
                            fontSize: 12, lineHeight: 1, padding: '4px 8px', borderRadius: 999,
                            border: 'none', display: 'flex', alignItems: 'center', gap: 4,
                            background: meins ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.12)',
                            color: meins ? '#1C1C1E' : 'rgba(255,255,255,0.75)',
                          }}
                        >
                          {emoji}
                          <span style={{ fontWeight: 600 }}>
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
            flex: 1, fontSize: 14, padding: '9px 13px', borderRadius: 12, border: 'none',
            background: 'rgba(255,255,255,0.13)', color: 'white', outline: 'none',
          }}
        />
        <button
          onClick={senden}
          disabled={!text.trim() || busy}
          style={{
            fontSize: 14, fontWeight: 700, padding: '9px 15px', borderRadius: 12, border: 'none',
            background: text.trim() ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.14)',
            color: text.trim() ? '#1C1C1E' : 'rgba(255,255,255,0.5)',
          }}
        >
          {busy ? '…' : 'Senden'}
        </button>
      </div>

      {error && <p style={{ fontSize: 12, color: '#FECACA', marginTop: 6 }}>⚠ {error}</p>}
    </div>
  )
}

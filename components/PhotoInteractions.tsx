'use client'

import { useEffect, useState } from 'react'
import { REACTIONS } from '@/lib/reactions'

type Reaction = { id: string; photo_id: string; user_id: string; emoji: string }
type Comment = { id: string; photo_id: string; user_id: string; text: string; created_at: string }

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
      setNames(data.names ?? {})
      setMe(data.me ?? null)
    }
    load()
    return () => { abgebrochen = true }
  }, [photoId])

  const nameOf = (id: string) => names[id] ?? 'Jemand'

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
      {/* Reaktionen */}
      <div className="flex gap-1.5 flex-wrap">
        {REACTIONS.map(emoji => {
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
      </div>

      {/* Wer hat womit reagiert. Der Tooltip allein reicht nicht: Auf dem
          iPhone gibt es kein Überfahren, dort wäre die Information unsichtbar. */}
      {reactions.length > 0 && (
        <div className="flex gap-x-3 gap-y-1 flex-wrap mt-2">
          {REACTIONS.filter(e => reactions.some(r => r.emoji === e)).map(emoji => (
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
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-2">
              <span style={{ fontSize: 13, color: 'white', lineHeight: 1.4 }}>
                <b style={{ color: 'rgba(255,255,255,0.75)' }}>{nameOf(c.user_id)}</b>{' '}
                {c.text}
              </span>
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
          ))}
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

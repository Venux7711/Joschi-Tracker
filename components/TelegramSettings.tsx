'use client'

import { useEffect, useState } from 'react'
import { TELEGRAM_TOPICS, type TelegramTopic } from '@/lib/telegram'

type Chat = {
  id: string
  chat_id: string
  label: string
  active: boolean
  topics: TelegramTopic[]
  last_sent_at: string | null
}

type Found = { chat_id: string; label: string }

export default function TelegramSettings() {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [botUsername, setBotUsername] = useState<string | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [found, setFound] = useState<Found[] | null>(null)

  const load = async () => {
    const res = await fetch('/api/telegram')
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setConnected(data.connected)
      setBotUsername(data.botUsername)
      setChats(data.chats ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const post = async (body: Record<string, unknown>, label: string) => {
    setBusy(label); setError(null); setNotice(null)
    const res = await fetch('/api/telegram', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(data.error ?? 'Fehlgeschlagen'); return null }
    return data
  }

  const connect = async () => {
    const data = await post({ action: 'connect', token: token.trim() }, 'connect')
    if (!data) return
    setToken('')
    setNotice(`Bot @${data.botUsername} verknüpft.`)
    load()
  }

  const disconnect = async () => {
    if (!confirm('Bot trennen? Die Empfänger bleiben gespeichert.')) return
    if (await post({ action: 'disconnect' }, 'disconnect')) { setNotice('Bot getrennt.'); load() }
  }

  const discover = async () => {
    const data = await post({ action: 'discover' }, 'discover')
    if (!data) return
    setFound(data.chats ?? [])
    if ((data.chats ?? []).length === 0) {
      setNotice('Keine neuen Chats gefunden. Schreib dem Bot in Telegram einmal "Hallo" und such dann erneut.')
    }
  }

  const addChat = async (c: Found) => {
    const data = await post({ action: 'add-chat', chat_id: c.chat_id, label: c.label }, `add-${c.chat_id}`)
    if (!data) return
    setFound(prev => (prev ?? []).filter(f => f.chat_id !== c.chat_id))
    setNotice(`${c.label} hinzugefügt – eine Begrüßung ist unterwegs.`)
    load()
  }

  const patchChat = async (chat: Chat, patch: Partial<Chat>) => {
    setChats(prev => prev.map(c => (c.id === chat.id ? { ...c, ...patch } : c)))
    const res = await fetch('/api/telegram', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chat.id, ...patch }),
    })
    if (!res.ok) { setError('Änderung konnte nicht gespeichert werden'); load() }
  }

  const toggleTopic = (chat: Chat, topic: TelegramTopic) => {
    const topics = chat.topics.includes(topic)
      ? chat.topics.filter(t => t !== topic)
      : [...chat.topics, topic]
    patchChat(chat, { topics })
  }

  const removeChat = async (chat: Chat) => {
    if (!confirm(`${chat.label} entfernen?`)) return
    setBusy(`del-${chat.id}`)
    const res = await fetch('/api/telegram', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: chat.id }),
    })
    setBusy(null)
    if (res.ok) { setChats(prev => prev.filter(c => c.id !== chat.id)) }
    else setError('Konnte nicht entfernt werden')
  }

  return (
    <div className="card overflow-hidden">
      <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>
          Telegram
        </h2>
        <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 2 }}>
          Ein Bot, der an mehrere Chats schickt – jeder bekommt nur, was er will
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '24px 20px' }}><div className="h-5 bg-gray-100 rounded animate-pulse" /></div>
      ) : !connected ? (
        <div style={{ padding: '16px 20px' }}>
          <ol style={{ fontSize: 13, color: 'rgba(60,60,67,0.6)', lineHeight: 1.7, marginBottom: 12, paddingLeft: 18, listStyle: 'decimal' }}>
            <li>In Telegram <b>@BotFather</b> anschreiben, <code>/newbot</code> senden</li>
            <li>Namen vergeben – am Ende kommt ein Token wie <code>123456:ABC-…</code></li>
            <li>Token hier einfügen</li>
          </ol>
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="123456789:AA…"
            className="input-field"
            autoComplete="off"
          />
          <button
            onClick={connect}
            disabled={!token.trim() || busy === 'connect'}
            className="btn-primary mt-3"
          >
            {busy === 'connect' ? 'Prüfe…' : 'Bot verknüpfen'}
          </button>
          <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.35)', marginTop: 8 }}>
            Das Token wird vor dem Speichern gegen Telegram geprüft und danach nie wieder angezeigt.
          </p>
        </div>
      ) : (
        <>
          <div style={{ padding: '14px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.07)' }} className="flex items-center justify-between gap-3">
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1E' }}>
                ✅ @{botUsername}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.4)' }}>Bot verknüpft</p>
            </div>
            <button onClick={disconnect} className="text-xs text-red-400 hover:text-red-600">Trennen</button>
          </div>

          {/* Empfänger */}
          <div style={{ padding: '14px 20px' }}>
            <div className="flex items-center justify-between mb-2">
              <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(60,60,67,0.4)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Empfänger
              </p>
              <button
                onClick={discover}
                disabled={busy === 'discover'}
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--am-600)' }}
              >
                {busy === 'discover' ? 'suche…' : '+ Chat suchen'}
              </button>
            </div>

            {chats.length === 0 && !found?.length && (
              <p style={{ fontSize: 13, color: 'rgba(60,60,67,0.45)' }}>
                Noch niemand verknüpft. Jede Person schreibt dem Bot einmal „Hallo" in Telegram,
                danach hier auf „Chat suchen".
              </p>
            )}

            {found && found.length > 0 && (
              <div className="mb-3 p-3 rounded-xl" style={{ background: 'rgba(var(--am-400-rgb), 0.08)' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--am-600)', marginBottom: 7 }}>Gefunden:</p>
                {found.map(f => (
                  <div key={f.chat_id} className="flex items-center justify-between gap-2 py-1">
                    <span style={{ fontSize: 13, color: '#1C1C1E' }}>{f.label}</span>
                    <button
                      onClick={() => addChat(f)}
                      disabled={busy === `add-${f.chat_id}`}
                      style={{ fontSize: 12, fontWeight: 700, color: 'var(--am-600)' }}
                    >
                      {busy === `add-${f.chat_id}` ? '…' : 'hinzufügen'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {chats.map(chat => (
                <div key={chat.id} className="rounded-xl border" style={{ borderColor: 'rgba(60,60,67,0.12)', padding: 12 }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1E' }} className="truncate">
                        {chat.label}
                      </p>
                      <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.35)' }}>
                        {chat.active ? 'aktiv' : 'pausiert'}
                        {chat.last_sent_at && ` · zuletzt ${new Date(chat.last_sent_at).toLocaleDateString('de-DE')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => post({ action: 'test', chat_id: chat.chat_id }, `test-${chat.id}`)}
                        style={{ fontSize: 11, color: 'var(--am-600)', fontWeight: 600 }}
                      >
                        {busy === `test-${chat.id}` ? '…' : 'Test'}
                      </button>
                      <button
                        onClick={() => patchChat(chat, { active: !chat.active })}
                        style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', fontWeight: 600 }}
                      >
                        {chat.active ? 'Pause' : 'Aktiv'}
                      </button>
                      <button onClick={() => removeChat(chat)} style={{ fontSize: 11, color: '#DC2626' }}>✕</button>
                    </div>
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {TELEGRAM_TOPICS.map(t => {
                      const on = chat.topics.includes(t.key)
                      return (
                        <button
                          key={t.key}
                          onClick={() => toggleTopic(chat, t.key)}
                          title={t.hint}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 999,
                            background: on ? 'var(--am-500, #f59e0b)' : 'rgba(120,120,128,0.1)',
                            color: on ? 'white' : 'rgba(60,60,67,0.5)',
                          }}
                        >
                          {on ? '✓ ' : ''}{t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {(error || notice) && (
        <div style={{ padding: '10px 20px 16px' }}>
          {error && <p className="text-sm text-red-600">⚠ {error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}
        </div>
      )}
    </div>
  )
}

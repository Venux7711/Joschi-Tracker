'use client'

import { useEffect, useRef, useState } from 'react'
import Header from '@/components/Header'
import type { AiMemory, ChatMessage } from '@/lib/types'

type DisplayMessage = ChatMessage & { tags?: string[] }

// Web Speech API ist nicht Teil der TS-DOM-Lib – minimale Typen für das, was wir nutzen.
interface SpeechRecognitionResultLike { transcript: string }
interface SpeechRecognitionEventLike { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const SUGGESTIONS = [
  { emoji: '🍽️', label: 'Gerade gefüttert', prompt: 'Joschi hat gerade gefressen: ' },
  { emoji: '🩺', label: 'Befinden melden', prompt: 'Joschis Befinden gerade eben: ' },
  { emoji: '⚖️', label: 'Gewicht eintragen', prompt: 'Joschi wiegt gerade ' },
  { emoji: '🥫', label: 'Vorrat ändern', prompt: 'Wir haben gerade eine Dose ' },
  { emoji: '🧠', label: 'Was weißt du?', prompt: 'Was weißt du bisher über Joschi?' },
]

function Bubble({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-amber-500 text-white rounded-br-md'
            : 'bg-white text-gray-800 border border-gray-100 rounded-bl-md'
        }`}
      >
        {msg.content}
      </div>
      {msg.tags && msg.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[80%]">
          {msg.tags.map((t, i) => (
            <span key={i} className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-1 rounded-full">
              ✓ {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function KnowledgePanel({
  memories,
  onAdd,
  onDelete,
  onClose,
}: {
  memories: AiMemory[]
  onAdd: (kind: 'fact' | 'instruction', content: string) => Promise<void>
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<'fact' | 'instruction'>('fact')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const facts = memories.filter((m) => m.kind === 'fact')
  const instructions = memories.filter((m) => m.kind === 'instruction')

  const submit = async () => {
    if (!text.trim()) return
    setSaving(true)
    await onAdd(kind, text.trim())
    setText('')
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Was die KI weiß</h2>
            <p className="text-xs text-gray-400 mt-0.5">Fakten &amp; Anweisungen, die du ihr beigebracht hast</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl leading-none px-1">✕</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5 flex-1">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fakten</p>
            {facts.length === 0 && <p className="text-sm text-gray-300">Noch nichts gelernt.</p>}
            <div className="space-y-1.5">
              {facts.map((m) => (
                <div key={m.id} className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-sm text-gray-700 flex-1">{m.content}</p>
                  <button onClick={() => onDelete(m.id)} className="text-gray-300 hover:text-red-400 text-sm px-1">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Verhaltensregeln</p>
            {instructions.length === 0 && <p className="text-sm text-gray-300">Noch keine eigenen Regeln.</p>}
            <div className="space-y-1.5">
              {instructions.map((m) => (
                <div key={m.id} className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-sm text-gray-700 flex-1">{m.content}</p>
                  <button onClick={() => onDelete(m.id)} className="text-gray-300 hover:text-red-400 text-sm px-1">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 space-y-2">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setKind('fact')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${kind === 'fact' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500'}`}
            >
              Fakt
            </button>
            <button
              onClick={() => setKind('instruction')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${kind === 'instruction' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500'}`}
            >
              Verhaltensregel
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              placeholder={kind === 'fact' ? 'z.B. Verträgt kein Huhn' : 'z.B. Antworte immer sehr kurz'}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <button
              onClick={submit}
              disabled={!text.trim() || saving}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [memories, setMemories] = useState<AiMemory[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showKnowledge, setShowKnowledge] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    fetch('/api/chat').then((r) => r.json()).then((d) => {
      setMessages(d.messages ?? [])
      setMemories(d.memories ?? [])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    setSpeechSupported(!!getSpeechRecognitionCtor())
    return () => { recognitionRef.current?.stop() }
  }, [])

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    const recognition = new Ctor()
    recognition.lang = 'de-DE'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((r) => r[0].transcript).join(' ').trim()
      if (transcript) setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript))
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!confirmClear) return
    const t = setTimeout(() => setConfirmClear(false), 3000)
    return () => clearTimeout(t)
  }, [confirmClear])

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || sending) return

    const optimistic: DisplayMessage = {
      id: `pending-${Date.now()}`, cat_id: '', user_id: '', role: 'user', content: text, created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    setInput('')
    setSending(true)
    setError(null)

    const maxAttempts = 3
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        })
        const data = await res.json()

        if (res.ok && data.reply) {
          const tags: string[] = [
            ...(data.performed ?? []),
            ...((data.remembered ?? []).map((r: { content: string }) => `Gemerkt: ${r.content}`)),
          ]
          setMessages((prev) => [
            ...prev,
            { id: `reply-${Date.now()}`, cat_id: '', user_id: '', role: 'assistant', content: data.reply, created_at: new Date().toISOString(), tags },
          ])
          if (data.remembered?.length) {
            fetch('/api/memories').then((r) => r.json()).then((d) => setMemories(d.memories ?? []))
          }
          if (tags.length === 1) setToast(tags[0])
          else if (tags.length > 1) setToast(`${tags.length} Aktionen erledigt`)
          setStatus(null)
          setSending(false)
          return
        }

        const retriable = res.status === 503 || data.retriable === true
        if (retriable && attempt < maxAttempts - 1) {
          setStatus(`Gemini ist gerade überlastet – neuer Versuch (${attempt + 2}/${maxAttempts})…`)
          await new Promise((r) => setTimeout(r, (attempt + 1) * 2500))
          continue
        }

        setError(data.detail ?? data.error ?? 'Unbekannter Fehler')
        setStatus(null)
        setSending(false)
        return
      } catch (e) {
        if (attempt < maxAttempts - 1) {
          setStatus(`Verbindungsproblem – neuer Versuch (${attempt + 2}/${maxAttempts})…`)
          await new Promise((r) => setTimeout(r, (attempt + 1) * 2500))
          continue
        }
        setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
        setStatus(null)
        setSending(false)
        return
      }
    }
  }

  const useSuggestion = (prompt: string) => {
    setInput(prompt)
    inputRef.current?.focus()
  }

  const addMemory = async (kind: 'fact' | 'instruction', content: string) => {
    const res = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, content }),
    })
    const data = await res.json()
    if (data.memory) setMemories((prev) => [data.memory, ...prev])
  }

  const deleteMemory = async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id))
    await fetch('/api/memories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  const clearHistory = async () => {
    if (!confirmClear) { setConfirmClear(true); return }
    setConfirmClear(false)
    setMessages([])
    await fetch('/api/chat', { method: 'DELETE' })
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="max-w-2xl w-full mx-auto px-4 py-3 flex items-center justify-between flex-shrink-0 gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-800">Chat</h1>
          <p className="text-xs text-gray-400 mt-0.5 truncate">Fragen stellen, Einträge machen, ihr etwas beibringen</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className={`text-sm font-medium px-3 py-2 rounded-xl transition-colors whitespace-nowrap ${
                confirmClear ? 'text-white bg-red-500 hover:bg-red-600' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {confirmClear ? 'Wirklich?' : '🗑️'}
            </button>
          )}
          <button
            onClick={() => setShowKnowledge(true)}
            className="text-sm font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            🧠 Wissen{memories.length > 0 ? ` (${memories.length})` : ''}
          </button>
        </div>
      </div>

      <main className="max-w-2xl w-full mx-auto px-4 flex-1 flex flex-col min-h-0 pb-4">
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {[1, 2].map((i) => <div key={i} className="h-12 bg-white rounded-2xl border border-gray-100 max-w-[70%]" />)}
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="card p-6 text-center mt-4">
              <p className="text-gray-400 text-sm">Noch keine Unterhaltung.</p>
              <p className="text-gray-300 text-xs mt-1.5 leading-relaxed">
                Frag mich etwas, bring mir etwas bei, oder trag direkt einen Eintrag ein – z.B. "Joschi hat gerade 85g Anifit Pute gefressen" oder "Merk dir, dass er kein Huhn verträgt".
              </p>
            </div>
          )}

          {messages.map((m) => <Bubble key={m.id} msg={m} />)}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-gray-400">
                {status ?? 'Tippt …'}
              </div>
            </div>
          )}

          {error && (
            <div className="px-3">
              <p className="text-xs text-red-500 font-medium">Antwort fehlgeschlagen</p>
              <p className="text-xs text-red-400 mt-0.5">{error}</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="flex-shrink-0 flex gap-1.5 overflow-x-auto pb-2 pt-1" style={{ scrollbarWidth: 'none' }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => useSuggestion(s.prompt)}
              className="flex-shrink-0 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:border-amber-300 hover:text-amber-700 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        <div className="flex-shrink-0 flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={listening ? 'Ich höre zu …' : 'Nachricht an die KI …'}
            rows={1}
            className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 max-h-32"
          />
          {speechSupported && (
            <button
              onClick={toggleListening}
              aria-label={listening ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
              className={`w-11 h-11 rounded-full flex items-center justify-center text-lg flex-shrink-0 transition-colors ${
                listening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              🎤
            </button>
          )}
          <button
            onClick={() => send()}
            disabled={!input.trim() || sending}
            className="px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-2xl disabled:opacity-40 transition-colors flex-shrink-0"
          >
            Senden
          </button>
        </div>
      </main>

      {showKnowledge && (
        <KnowledgePanel memories={memories} onAdd={addMemory} onDelete={deleteMemory} onClose={() => setShowKnowledge(false)} />
      )}

      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-lg z-50 max-w-[90vw] text-center">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

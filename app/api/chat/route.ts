import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CAT_PROFILE } from '@/lib/cat-profile'
import type { AiMemory, ChatMessage } from '@/lib/types'

// Vercel: mehr Zeitbudget, damit Retry + Fallback-Modell nicht ins Funktions-Timeout laufen
export const maxDuration = 30

const STOOL: Record<string, string> = { normal: 'Normal', soft: 'Weich', diarrhea: 'DURCHFALL', not_observed: 'Nicht gesehen' }
const APPETITE: Record<string, string> = { good: 'Gut', reduced: 'Wenig', none: 'Gar nicht' }
const ACTIVITY: Record<string, string> = { normal: 'Normal', tired: 'Müde', very_active: 'Sehr aktiv' }

// Gleiche Modellkette wie /api/analyze-health: primär das aktuelle Flash,
// bei Überlastung Fallback auf das Lite-Modell.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const HISTORY_LIMIT = 20
const MAX_REMEMBER_PER_TURN = 5

function isOverloaded(status: number, body: string): boolean {
  if (status === 503 || status === 429) return true
  return /overload|high demand|unavailable|resource_exhausted|try again/i.test(body)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type ChatResult = { reply: string; remember: { kind: 'fact' | 'instruction'; content: string }[] }
type GeminiResult =
  | { ok: true; result: ChatResult }
  | { ok: false; overloaded: boolean; detail: string }

function parseChatJson(raw: string): ChatResult | null {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : ''
    if (!reply) return null
    const remember = Array.isArray(parsed.remember)
      ? parsed.remember
          .filter((r: unknown): r is { kind: unknown; content: unknown } =>
            !!r && typeof r === 'object' && typeof (r as { content?: unknown }).content === 'string' && (r as { content: string }).content.trim().length > 0)
          .slice(0, MAX_REMEMBER_PER_TURN)
          .map((r: { kind: unknown; content: unknown }) => ({
            kind: r.kind === 'instruction' ? 'instruction' as const : 'fact' as const,
            content: (r.content as string).trim().slice(0, 500),
          }))
      : []
    return { reply, remember }
  } catch {
    return null
  }
}

async function callGemini(
  model: string, apiKey: string, systemPrompt: string, contents: { role: string; parts: { text: string }[] }[],
): Promise<GeminiResult> {
  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.5, responseMimeType: 'application/json' },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`Gemini ${model} HTTP ${res.status}:`, err.slice(0, 300))
    return { ok: false, overloaded: isOverloaded(res.status, err), detail: err }
  }

  const data = await res.json()
  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('').trim()

  if (!text) {
    const reason = candidate?.finishReason ?? 'unbekannt'
    console.error(`Gemini ${model} leere Antwort, finishReason:`, reason)
    return { ok: false, overloaded: true, detail: `Keine Antwort erhalten (${reason}).` }
  }

  const result = parseChatJson(text)
  if (!result) {
    console.error(`Gemini ${model} lieferte kein gültiges JSON:`, text.slice(0, 300))
    return { ok: false, overloaded: true, detail: 'Antwort hatte ein unerwartetes Format.' }
  }

  return { ok: true, result }
}

async function getCatId(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from('cats').select('id').limit(1).single()
  return data?.id as string | undefined
}

function buildSystemPrompt(memories: AiMemory[], feedingLines: string, healthLines: string): string {
  const instructions = memories.filter((m) => m.kind === 'instruction')
  const facts = memories.filter((m) => m.kind === 'fact')

  const instructionsBlock = instructions.length
    ? `═══ VERHALTENSREGELN VOM NUTZER ═══\n${instructions.map((m) => `- ${m.content}`).join('\n')}\n`
    : ''
  const factsBlock = facts.length
    ? `═══ WAS DU ÜBER ${CAT_PROFILE.name.toUpperCase()} WEISST ═══\n${facts.map((m) => `- ${m.content}`).join('\n')}\n`
    : ''

  return `Du bist der persönliche Chat-Assistent rund um ${CAT_PROFILE.name}, ${CAT_PROFILE.descriptionAccusative} mit ${CAT_PROFILE.condition.toLowerCase()}. Du sprichst mit ${CAT_PROFILE.name}s Dosenöffner:in über Fütterung, Gesundheit und Alltag.

${instructionsBlock}${factsBlock}═══ FUTTER- & BEFINDEN-PROTOKOLL (letzte 14 Tage, neueste zuerst) ═══
${feedingLines || 'Keine Futter-Daten vorhanden.'}
${healthLines || 'Keine Befinden-Daten vorhanden.'}

Antworte immer auf Deutsch, freundlich, direkt und knapp (max. ca. 120 Wörter), außer der Nutzer bittet ausdrücklich um mehr Details oder eine "Verhaltensregel" oben verlangt etwas anderes – Verhaltensregeln vom Nutzer haben Vorrang vor diesen Standard-Vorgaben.

Wenn der Nutzer dir in seiner Nachricht etwas beibringen will, das du dir DAUERHAFT merken sollst – z.B. einen Fakt über ${CAT_PROFILE.name} ("er verträgt kein Huhn") oder eine Anweisung, wie du künftig antworten sollst ("antworte immer sehr kurz", "sei nicht so förmlich") – dann trage das in "remember" ein. Merke es dir sofort, ohne erst nachzufragen, und bestätige kurz in "reply". Nutze "fact" für Wissen über die Katze/den Alltag, "instruction" für Verhaltensregeln, wie du antworten sollst. Bei normalen Fragen bleibt "remember" ein leeres Array.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Markdown, ohne Codeblock, ohne weiteren Text davor oder danach:
{"reply": "deine Antwort an den Nutzer", "remember": [{"kind": "fact", "content": "kurzer, eigenständiger Satz"}]}`
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const catId = await getCatId(supabase)
  if (!catId) return NextResponse.json({ messages: [], memories: [] })

  const [{ data: messages }, { data: memories }] = await Promise.all([
    supabase.from('chat_messages').select('*').eq('cat_id', catId).order('created_at', { ascending: true }).limit(200),
    supabase.from('ai_memories').select('*').eq('cat_id', catId).order('created_at', { ascending: false }),
  ])

  return NextResponse.json({ messages: messages ?? [], memories: memories ?? [] })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message } = await req.json()
    const trimmed = typeof message === 'string' ? message.trim() : ''
    if (!trimmed) return NextResponse.json({ error: 'Nachricht fehlt' }, { status: 400 })

    const catId = await getCatId(supabase)
    if (!catId) return NextResponse.json({ error: 'Keine Katze gefunden' }, { status: 404 })

    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const [{ data: history }, { data: memories }, { data: feedings }, { data: health }] = await Promise.all([
      supabase.from('chat_messages').select('*').eq('cat_id', catId).order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
      supabase.from('ai_memories').select('*').eq('cat_id', catId).order('created_at', { ascending: false }),
      supabase.from('feeding_logs').select('*').eq('cat_id', catId).gte('logged_at', fourteenDaysAgo.toISOString()).order('logged_at', { ascending: false }).limit(30),
      supabase.from('health_logs').select('*').eq('cat_id', catId).gte('logged_at', fourteenDaysAgo.toISOString()).order('logged_at', { ascending: false }).limit(30),
    ])

    const feedingLines = (feedings ?? []).map((f) => {
      let line = `${f.logged_at.slice(0, 10)}: ${f.food_brand} – ${f.food_type}`
      if (f.amount_grams) line += ` (${f.amount_grams}g)`
      return line
    }).join('\n')

    const healthLines = (health ?? []).map((h) => {
      let line = `${h.logged_at.slice(0, 10)}: Stuhl: ${STOOL[h.stool_consistency] ?? h.stool_consistency}, Appetit: ${APPETITE[h.appetite] ?? h.appetite}, Aktivität: ${ACTIVITY[h.activity] ?? h.activity}`
      if (h.vomiting) line += ' ⚠ ERBROCHEN'
      if (h.fur_issue) line += ' ⚠ KOT IM FELL'
      if (h.notes) line += ` | Notiz: "${h.notes}"`
      return line
    }).join('\n')

    const systemPrompt = buildSystemPrompt((memories ?? []) as AiMemory[], feedingLines, healthLines)

    const orderedHistory = [...(history ?? [])].reverse() as ChatMessage[]
    const contents = [
      ...orderedHistory.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
      { role: 'user', parts: [{ text: trimmed }] },
    ]

    // Nutzer-Nachricht sofort speichern, damit sie im Verlauf bleibt, auch falls die KI-Antwort scheitert
    await supabase.from('chat_messages').insert({ user_id: user.id, cat_id: catId, role: 'user', content: trimmed })

    const apiKey = process.env.GOOGLE_AI_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Chat fehlgeschlagen', detail: 'GOOGLE_AI_KEY ist nicht gesetzt.' }, { status: 500 })
    }

    let lastDetail = 'Unbekannter Fehler'
    let lastOverloaded = false

    for (let m = 0; m < GEMINI_MODELS.length; m++) {
      const model = GEMINI_MODELS[m]
      const attempts = 2

      for (let a = 0; a < attempts; a++) {
        const outcome = await callGemini(model, apiKey, systemPrompt, contents)
        if (outcome.ok) {
          const { reply, remember } = outcome.result

          const remembered: { kind: 'fact' | 'instruction'; content: string }[] = []
          for (const item of remember) {
            const { error } = await supabase.from('ai_memories').insert({
              user_id: user.id, cat_id: catId, kind: item.kind, content: item.content,
            })
            if (!error) remembered.push(item)
          }

          await supabase.from('chat_messages').insert({ user_id: user.id, cat_id: catId, role: 'assistant', content: reply })

          return NextResponse.json({ reply, remembered })
        }

        lastDetail = outcome.detail
        lastOverloaded = outcome.overloaded

        if (!outcome.overloaded) {
          return NextResponse.json({ error: 'Chat fehlgeschlagen', detail: lastDetail }, { status: 500 })
        }

        if (a < attempts - 1) await sleep(1200)
      }
    }

    return NextResponse.json(
      {
        error: 'Chat fehlgeschlagen',
        detail: 'Gemini ist gerade stark ausgelastet. Bitte gleich noch einmal versuchen.',
        retriable: lastOverloaded,
      },
      { status: 503 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('chat error:', msg)
    return NextResponse.json({ error: 'Chat fehlgeschlagen', detail: msg }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getActiveCat, getCats } from '@/lib/active-cat.server'
import { dedupeSharedFeedings } from '@/lib/utils'
import type { AiMemory, Cat, ChatMessage, StoolConsistency, Appetite, Activity } from '@/lib/types'

// Vercel: mehr Zeitbudget, damit Retry + Fallback-Modell nicht ins Funktions-Timeout laufen
export const maxDuration = 30

const STOOL: Record<string, string> = { normal: 'Normal', soft: 'Weich', diarrhea: 'DURCHFALL', not_observed: 'Nicht gesehen' }
const APPETITE: Record<string, string> = { good: 'Gut', reduced: 'Wenig', none: 'Gar nicht' }
const ACTIVITY: Record<string, string> = { normal: 'Normal', tired: 'Müde', very_active: 'Sehr aktiv' }
const STOOL_VALUES = new Set<StoolConsistency>(['normal', 'soft', 'diarrhea', 'not_observed'])
const APPETITE_VALUES = new Set<Appetite>(['good', 'reduced', 'none'])
const ACTIVITY_VALUES = new Set<Activity>(['normal', 'tired', 'very_active'])

// Gleiche Modellkette wie /api/analyze-health: primär das aktuelle Flash,
// bei Überlastung Fallback auf das Lite-Modell.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const HISTORY_LIMIT = 20
const MAX_REMEMBER_PER_TURN = 5
const MAX_ACTIONS_PER_TURN = 5

// weights/medications laufen (wie in /api/weight und /api/medications) über den
// Service-Role-Client, weil die RLS-Policies dieser Tabellen anonyme/normale
// authentifizierte Schreib-/Lesezugriffe nicht zulassen.
function createServiceClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
}

function isOverloaded(status: number, body: string): boolean {
  if (status === 503 || status === 429) return true
  return /overload|high demand|unavailable|resource_exhausted|try again/i.test(body)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)))

// Zeigt die Uhrzeit im Bestätigungstext nur an, wenn rückdatiert wurde – bei "jetzt" wäre es Rauschen.
function formatWhen(iso: string): string {
  const diffMs = Math.abs(Date.now() - new Date(iso).getTime())
  if (diffMs < 5 * 60 * 1000) return ''
  return ` – ${new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
}

type MemoryItem = { kind: 'fact' | 'instruction'; content: string }
type FeedingAction = { type: 'log_feeding'; food_brand: string; food_type: string; amount_grams?: number; logged_at?: string }
type HealthAction = {
  type: 'log_health'; stool_consistency: StoolConsistency; vomiting: boolean
  appetite: Appetite; activity: Activity; fur_issue: boolean; notes?: string; logged_at?: string
}
type PantryAction = { type: 'adjust_pantry'; brand: string; food_type: string; delta: number }
type WeightAction = { type: 'log_weight'; weight_grams: number }
type ChatAction = FeedingAction | HealthAction | PantryAction | WeightAction

type ChatResult = { reply: string; remember: MemoryItem[]; actions: ChatAction[] }
type GeminiResult =
  | { ok: true; result: ChatResult }
  | { ok: false; overloaded: boolean; detail: string }

function str(v: unknown, maxLen: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim()
  return trimmed ? trimmed.slice(0, maxLen) : undefined
}

// Erlaubt Rückdatierung (der Nutzer erzählt z.B. von "heute Mittag"), aber nur in einem
// enge Fenster – alles Ältere ist zu unsicher, um es der KI blind glauben zu lassen.
function parseLoggedAt(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined
  const d = new Date(v)
  if (isNaN(d.getTime())) return undefined
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const fifteenMinFromNow = now + 15 * 60 * 1000
  if (d.getTime() < sevenDaysAgo || d.getTime() > fifteenMinFromNow) return undefined
  return d.toISOString()
}

function parseAction(raw: unknown): ChatAction | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>

  if (a.type === 'log_feeding') {
    const food_brand = str(a.food_brand, 100)
    const food_type = str(a.food_type, 100)
    if (!food_brand || !food_type) return null
    const amount = typeof a.amount_grams === 'number' && isFinite(a.amount_grams) ? clamp(a.amount_grams, 1, 500) : undefined
    return { type: 'log_feeding', food_brand, food_type, amount_grams: amount, logged_at: parseLoggedAt(a.logged_at) }
  }

  if (a.type === 'log_health') {
    const stool_consistency = STOOL_VALUES.has(a.stool_consistency as StoolConsistency) ? a.stool_consistency as StoolConsistency : 'not_observed'
    const appetite = APPETITE_VALUES.has(a.appetite as Appetite) ? a.appetite as Appetite : 'good'
    const activity = ACTIVITY_VALUES.has(a.activity as Activity) ? a.activity as Activity : 'normal'
    return {
      type: 'log_health', stool_consistency, appetite, activity,
      vomiting: a.vomiting === true, fur_issue: a.fur_issue === true, notes: str(a.notes, 300),
      logged_at: parseLoggedAt(a.logged_at),
    }
  }

  if (a.type === 'adjust_pantry') {
    const brand = str(a.brand, 100)
    const food_type = str(a.food_type, 100)
    const delta = typeof a.delta === 'number' && isFinite(a.delta) ? clamp(a.delta, -20, 20) : 0
    if (!brand || !food_type || delta === 0) return null
    return { type: 'adjust_pantry', brand, food_type, delta }
  }

  if (a.type === 'log_weight') {
    if (typeof a.weight_grams !== 'number' || !isFinite(a.weight_grams)) return null
    return { type: 'log_weight', weight_grams: clamp(a.weight_grams, 200, 15000) }
  }

  return null
}

function parseChatJson(raw: string): ChatResult | null {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : ''
    if (!reply) return null

    const remember: MemoryItem[] = Array.isArray(parsed.remember)
      ? parsed.remember
          .filter((r: unknown): r is { kind: unknown; content: unknown } =>
            !!r && typeof r === 'object' && typeof (r as { content?: unknown }).content === 'string' && (r as { content: string }).content.trim().length > 0)
          .slice(0, MAX_REMEMBER_PER_TURN)
          .map((r: { kind: unknown; content: unknown }) => ({
            kind: r.kind === 'instruction' ? 'instruction' as const : 'fact' as const,
            content: (r.content as string).trim().slice(0, 500),
          }))
      : []

    const actions: ChatAction[] = Array.isArray(parsed.actions)
      ? parsed.actions.map(parseAction).filter((a: ChatAction | null): a is ChatAction => a !== null).slice(0, MAX_ACTIONS_PER_TURN)
      : []

    return { reply, remember, actions }
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
      generationConfig: { maxOutputTokens: 1536, temperature: 0.5, responseMimeType: 'application/json' },
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

function buildSystemPrompt(
  cat: Cat, memories: AiMemory[], feedingLines: string, healthLines: string, pantryLines: string, medsLines: string, weightLines: string, now: Date,
): string {
  const nowLabel = now.toLocaleString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  const instructions = memories.filter((m) => m.kind === 'instruction')
  const facts = memories.filter((m) => m.kind === 'fact')
  const description = cat.description_accusative || cat.name
  const conditionClause = cat.condition ? ` mit ${cat.condition.toLowerCase()}` : ''

  const instructionsBlock = instructions.length
    ? `═══ VERHALTENSREGELN VOM NUTZER ═══\n${instructions.map((m) => `- ${m.content}`).join('\n')}\n`
    : ''
  const factsBlock = facts.length
    ? `═══ WAS DU ÜBER ${cat.name.toUpperCase()} WEISST ═══\n${facts.map((m) => `- ${m.content}`).join('\n')}\n`
    : ''

  return `Du bist der persönliche Chat-Assistent rund um ${cat.name}, ${description}${conditionClause}. Du sprichst mit ${cat.name}s Dosenöffner:in über Fütterung, Gesundheit und Alltag.

Aktuelles Datum/Uhrzeit: ${nowLabel} (ISO: ${now.toISOString()})

${instructionsBlock}${factsBlock}═══ FUTTER- & BEFINDEN-PROTOKOLL (letzte 14 Tage, neueste zuerst) ═══
${feedingLines || 'Keine Futter-Daten vorhanden.'}
${healthLines || 'Keine Befinden-Daten vorhanden.'}

═══ AKTUELLER VORRAT ═══
${pantryLines || 'Kein Vorrat erfasst.'}

═══ AKTIVE MEDIKAMENTE ═══
${medsLines || 'Keine aktiven Medikamente.'}

═══ GEWICHT ═══
${weightLines || 'Kein Gewicht erfasst.'}

Antworte immer auf Deutsch, freundlich, direkt und knapp (max. ca. 120 Wörter), außer der Nutzer bittet ausdrücklich um mehr Details oder eine "Verhaltensregel" oben verlangt etwas anderes – Verhaltensregeln vom Nutzer haben Vorrang vor diesen Standard-Vorgaben.

═══ MERKEN ═══
Wenn der Nutzer dir in seiner Nachricht etwas beibringen will, das du dir DAUERHAFT merken sollst – z.B. einen Fakt über ${cat.name} ("er verträgt kein Huhn") oder eine Anweisung, wie du künftig antworten sollst ("antworte immer sehr kurz", "sei nicht so förmlich") – dann trage das in "remember" ein. Merke es dir sofort, ohne erst nachzufragen, und bestätige kurz in "reply". Nutze "fact" für Wissen über die Katze/den Alltag, "instruction" für Verhaltensregeln, wie du antworten sollst. Bei normalen Fragen bleibt "remember" ein leeres Array.

═══ HANDELN ═══
Du kannst auch direkt Einträge für den Nutzer vornehmen, wenn er dir von etwas erzählt, das passiert ist – trage das SOFORT ein, ohne nachzufragen, und bestätige in "reply" knapp und konkret, was genau du mit welcher Uhrzeit eingetragen hast (damit Fehler sofort auffallen):
- "log_feeding" {food_brand, food_type, amount_grams?, logged_at?}: wenn ${cat.name} gefüttert wurde/wird.
- "log_health" {stool_consistency: "normal"|"soft"|"diarrhea"|"not_observed", vomiting: bool, appetite: "good"|"reduced"|"none", activity: "normal"|"tired"|"very_active", fur_issue: bool, notes?, logged_at?}: wenn der Nutzer sein Befinden beschreibt. Setze nur Felder, die klar aus der Nachricht hervorgehen, sonst nutze plausible neutrale Standardwerte (stool_consistency "not_observed", appetite "good", activity "normal", vomiting/fur_issue false). Alles, was über die festen Felder hinausgeht – Aussehen/Menge/Farbe von Kot, Auffälligkeiten, sonstige Beobachtungen – schreibst du als kurzen, klaren Satz in "notes", damit nichts verloren geht.
- "adjust_pantry" {brand, food_type, delta}: wenn eine Dose geöffnet/verbraucht wurde (delta negativ, meist -1) oder neuer Vorrat dazukam (delta positiv). Kein logged_at nötig.
- "log_weight" {weight_grams}: wenn der Nutzer ein aktuelles Gewicht nennt (in Gramm, z.B. 4200 für 4,2kg). Kein logged_at nötig.

Zeitpunkt ("logged_at"): Optionales Feld als ISO-8601-Datetime (z.B. "2026-07-16T12:30:00"). Berechne es aus dem, was der Nutzer sagt, relativ zum aktuellen Datum/Uhrzeit oben – "gerade eben"/keine Angabe → weglassen (wird automatisch "jetzt"), "heute Mittag"/"18 Uhr" → heutiges Datum mit dieser Uhrzeit, "vor 2 Stunden" → aktuelle Zeit minus 2h, "gestern Abend" → gestriges Datum. Rückdatierung funktioniert nur bis zu 7 Tage in die Vergangenheit; bei älteren oder sehr unklaren Zeitangaben trage nichts ein und verweise stattdessen auf die passende Seite in der App. Bei Unsicherheit über Werte lieber kurz nachfragen statt zu raten. Bei reinen Fragen bleibt "actions" ein leeres Array.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format, ohne Markdown, ohne Codeblock, ohne weiteren Text davor oder danach:
{"reply": "deine Antwort an den Nutzer", "remember": [{"kind": "fact", "content": "kurzer, eigenständiger Satz"}], "actions": [{"type": "log_feeding", "food_brand": "...", "food_type": "...", "amount_grams": 85, "logged_at": "2026-07-16T18:00:00"}]}`
}

async function executeAction(
  rlsSupabase: ReturnType<typeof createClient>, userId: string, catId: string, allCatIds: string[], action: ChatAction,
): Promise<string | null> {
  if (action.type === 'log_feeding') {
    const loggedAt = action.logged_at ?? new Date().toISOString()
    // Gefüttert wird immer gemeinsam → eine Zeile pro Katze (wie im Futter-Formular)
    const { error } = await rlsSupabase.from('feeding_logs').insert(allCatIds.map((cid) => ({
      user_id: userId, cat_id: cid, food_brand: action.food_brand, food_type: action.food_type,
      amount_grams: action.amount_grams ?? null, logged_at: loggedAt,
    })))
    if (error) { console.error('log_feeding error:', error.message); return null }
    return `Futter eingetragen: ${action.food_type || action.food_brand}${action.amount_grams ? ` (${action.amount_grams}g)` : ''}${formatWhen(loggedAt)}`
  }

  if (action.type === 'log_health') {
    const loggedAt = action.logged_at ?? new Date().toISOString()
    const { error } = await rlsSupabase.from('health_logs').insert({
      user_id: userId, cat_id: catId, stool_consistency: action.stool_consistency, vomiting: action.vomiting,
      appetite: action.appetite, activity: action.activity, fur_issue: action.fur_issue, notes: action.notes ?? null,
      logged_at: loggedAt,
    })
    if (error) { console.error('log_health error:', error.message); return null }
    const extras = [action.vomiting && 'erbrochen', action.fur_issue && 'Fell betroffen'].filter(Boolean).join(', ')
    return `Befinden eingetragen: ${STOOL[action.stool_consistency]}${extras ? ` (${extras})` : ''}${formatWhen(loggedAt)}`
  }

  if (action.type === 'adjust_pantry') {
    // Vorrat ist Haushalts-, nicht Katzen-spezifisch – über alle Katzen suchen
    const { data: existing } = await rlsSupabase.from('pantry_items').select('*')
      .in('cat_id', allCatIds).ilike('brand', action.brand).ilike('type', action.food_type).maybeSingle()

    if (existing) {
      const newQty = Math.max(0, existing.quantity + action.delta)
      const { error } = await rlsSupabase.from('pantry_items')
        .update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', existing.id)
      if (error) { console.error('adjust_pantry update error:', error.message); return null }
      return `Vorrat aktualisiert: ${action.food_type || action.brand} → ${newQty} Dose${newQty !== 1 ? 'n' : ''}`
    }

    if (action.delta > 0) {
      const { error } = await rlsSupabase.from('pantry_items').insert({
        user_id: userId, cat_id: catId, brand: action.brand, type: action.food_type, quantity: action.delta,
      })
      if (error) { console.error('adjust_pantry insert error:', error.message); return null }
      return `Neu im Vorrat: ${action.food_type || action.brand} (${action.delta} Dose${action.delta !== 1 ? 'n' : ''})`
    }

    return null
  }

  if (action.type === 'log_weight') {
    const serviceSupabase = createServiceClient()
    const { error } = await serviceSupabase.from('weights').insert({
      user_id: userId, cat_id: catId, weight_grams: action.weight_grams,
    })
    if (error) { console.error('log_weight error:', error.message); return null }
    return `Gewicht eingetragen: ${(action.weight_grams / 1000).toFixed(2)} kg`
  }

  return null
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cat = await getActiveCat(supabase)
  if (!cat) return NextResponse.json({ messages: [], memories: [] })

  const [{ data: messages }, { data: memories }] = await Promise.all([
    supabase.from('chat_messages').select('*').eq('cat_id', cat.id).order('created_at', { ascending: true }).limit(200),
    supabase.from('ai_memories').select('*').eq('cat_id', cat.id).order('created_at', { ascending: false }),
  ])

  return NextResponse.json({ messages: messages ?? [], memories: memories ?? [] })
}

export async function DELETE() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cat = await getActiveCat(supabase)
  if (cat) await supabase.from('chat_messages').delete().eq('cat_id', cat.id).eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message } = await req.json()
    const trimmed = typeof message === 'string' ? message.trim() : ''
    if (!trimmed) return NextResponse.json({ error: 'Nachricht fehlt' }, { status: 400 })

    const cat = await getActiveCat(supabase)
    if (!cat) return NextResponse.json({ error: 'Keine Katze gefunden' }, { status: 404 })
    const catId = cat.id
    const allCatIds = (await getCats(supabase)).map((c) => c.id)

    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const serviceSupabase = createServiceClient()

    const [
      { data: history }, { data: memories }, { data: feedings }, { data: health }, { data: pantry },
      { data: meds }, { data: weights },
    ] = await Promise.all([
      supabase.from('chat_messages').select('*').eq('cat_id', catId).order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
      supabase.from('ai_memories').select('*').eq('cat_id', catId).order('created_at', { ascending: false }),
      // Fütterung geteilt (Haushalt), Befinden individuell (aktive Katze)
      supabase.from('feeding_logs').select('*').in('cat_id', allCatIds).gte('logged_at', fourteenDaysAgo.toISOString()).order('logged_at', { ascending: false }).limit(30),
      supabase.from('health_logs').select('*').eq('cat_id', catId).gte('logged_at', fourteenDaysAgo.toISOString()).order('logged_at', { ascending: false }).limit(30),
      // Vorrat ist Haushalts-, nicht Katzen-spezifisch
      supabase.from('pantry_items').select('*').in('cat_id', allCatIds).gt('quantity', 0),
      serviceSupabase.from('medications').select('*').eq('cat_id', catId).eq('active', true),
      serviceSupabase.from('weights').select('*').eq('cat_id', catId).order('measured_at', { ascending: false }).limit(6),
    ])

    const feedingLines = dedupeSharedFeedings(feedings ?? []).map((f) => {
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

    const pantryLines = (pantry ?? []).map((p) => `${p.brand} ${p.type}: ${p.quantity} Dose${p.quantity !== 1 ? 'n' : ''}`).join('\n')

    const medsLines = (meds ?? []).map((m) => {
      let line = `${m.name}`
      if (m.dosage) line += ` – ${m.dosage}`
      if (m.frequency) line += ` · ${m.frequency}`
      return line
    }).join('\n')

    const weightLines = (weights ?? []).length
      ? (weights ?? []).map((w) => `${(w.weight_grams / 1000).toFixed(2)}kg am ${w.measured_at.slice(0, 10)}`).join('\n')
      : ''

    const systemPrompt = buildSystemPrompt(cat, (memories ?? []) as AiMemory[], feedingLines, healthLines, pantryLines, medsLines, weightLines, new Date())

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
          const { reply, remember, actions } = outcome.result

          const remembered: MemoryItem[] = []
          for (const item of remember) {
            const { error } = await supabase.from('ai_memories').insert({
              user_id: user.id, cat_id: catId, kind: item.kind, content: item.content,
            })
            if (!error) remembered.push(item)
          }

          const performed: string[] = []
          for (const action of actions) {
            const summary = await executeAction(supabase, user.id, catId, allCatIds, action)
            if (summary) performed.push(summary)
          }

          await supabase.from('chat_messages').insert({ user_id: user.id, cat_id: catId, role: 'assistant', content: reply })

          return NextResponse.json({ reply, remembered, performed })
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

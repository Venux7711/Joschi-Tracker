import { NextRequest, NextResponse } from 'next/server'

// Vercel: mehr Zeitbudget, damit Retry + Fallback-Modell nicht ins Funktions-Timeout laufen
export const maxDuration = 30

const MENGE = ['nichts', 'sehr wenig', 'wenig', 'mittel', 'viel']
const STOOL: Record<string, string> = { normal: 'Normal', soft: 'Weich', diarrhea: 'DURCHFALL', not_observed: 'Nicht gesehen' }
const APPETITE: Record<string, string> = { good: 'Gut', reduced: 'Wenig', none: 'Gar nicht' }
const ACTIVITY: Record<string, string> = { normal: 'Normal', tired: 'Müde', very_active: 'Sehr aktiv' }

// Modellkette: primär das aktuelle Flash, bei Überlastung das Lite-Modell
// (geringere Nachfrage, 0 Thinking-Tokens → schnell & robust).
// gemini-1.5-* ist abgeschaltet, gemini-2.5-flash für neue Projekte gesperrt.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// 503/429/UNAVAILABLE/„overloaded" = transiente Überlastung → erneut versuchen lohnt sich
function isOverloaded(status: number, body: string): boolean {
  if (status === 503 || status === 429) return true
  return /overload|high demand|unavailable|resource_exhausted|try again/i.test(body)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type GeminiResult =
  | { ok: true; analysis: string }
  | { ok: false; overloaded: boolean; detail: string }

async function callGemini(model: string, apiKey: string, prompt: string): Promise<GeminiResult> {
  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // Flash denkt vor dem Antworten – das Denken zählt gegen maxOutputTokens.
      // Budget muss Thinking + ~280 Wörter Antwort abdecken, sonst kommt sie leer zurück.
      generationConfig: { maxOutputTokens: 4096, temperature: 0.4 },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`Gemini ${model} HTTP ${res.status}:`, err.slice(0, 300))
    return { ok: false, overloaded: isOverloaded(res.status, err), detail: err }
  }

  const data = await res.json()
  const candidate = data.candidates?.[0]
  const analysis = candidate?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('')
    .trim()

  if (!analysis) {
    const reason = candidate?.finishReason ?? 'unbekannt'
    console.error(`Gemini ${model} leere Antwort, finishReason:`, reason, JSON.stringify(data.usageMetadata))
    // Leere Antwort einmal woanders versuchen zu lassen ist sinnvoll → als „overloaded" behandeln
    return { ok: false, overloaded: true, detail: `Keine Antwort erhalten (${reason}).` }
  }

  return { ok: true, analysis }
}

export async function POST(req: NextRequest) {
  try {
    const { feedings, health, pantry = [], cat = {} } = await req.json()
    const catName: string = cat.name || 'die Katze'
    const catBreed: string = cat.breed || ''
    const catDescription: string = cat.descriptionAccusative || catName
    const catCondition: string = cat.condition || ''
    const isLonghair = /langhaar/i.test(catBreed)

    const feedingLines = feedings.map((f: {
      date: string; brand: string; type: string; grams?: number
      treat?: number; dry?: number; extras?: string
    }) => {
      let line = `${f.date}: ${f.brand} – ${f.type}`
      if (f.grams) line += ` (${f.grams}g)`
      if (f.treat && f.treat > 0) line += `, Leckerli: ${MENGE[f.treat]}`
      if (f.dry && f.dry > 0) line += `, Trockenfutter: ${MENGE[f.dry]}`
      if (f.extras) line += `, Sonstiges: ${f.extras}`
      return line
    }).join('\n')

    const healthLines = health.map((h: {
      date: string; stool: string; appetite: string; activity: string
      vomiting: boolean; furIssue: boolean; notes?: string
    }) => {
      let line = `${h.date}: Stuhl: ${STOOL[h.stool] ?? h.stool}, Appetit: ${APPETITE[h.appetite] ?? h.appetite}, Aktivität: ${ACTIVITY[h.activity] ?? h.activity}`
      if (h.vomiting) line += ' ⚠ ERBROCHEN'
      if (h.furIssue) line += ' ⚠ KOT IM FELL'
      if (h.notes) line += ` | Notiz: "${h.notes}"`
      return line
    }).join('\n')

    const pantrySection = pantry.length > 0
      ? `\n═══ AKTUELLER VORRAT ═══\n${(pantry as string[]).join('\n')}`
      : ''

    const conditionClause = catCondition ? ` mit ${catCondition.toLowerCase()}` : ''
    const furParagraph = isLonghair
      ? `\nZur Rasse: ${catName} ist ${catBreed}. Als Langhaarrasse ist bei ihm Kot im Fell ein relevantes Begleitproblem bei weichem Stuhl.\n`
      : catBreed ? `\nZur Rasse: ${catName} ist ${catBreed}.\n` : ''

    const prompt = `Du bist ein erfahrener Tiergesundheits-Assistent. Analysiere folgende Daten für ${catName}, ${catDescription}${conditionClause}.
${furParagraph}
WICHTIG zu Proteinquellen:
- Mono-Protein = nur eine Fleischquelle (z.B. nur Truthahn) → besser bei Unverträglichkeiten
- Multi-Protein = mehrere Fleischquellen → höheres Allergiepotenzial
- Protein-Rotation ist wichtig: nicht immer dieselbe Quelle
- Geflügel (Huhn, Truthahn, Ente) und Fisch (Lachs, Hering) sind unterschiedliche Proteinfamilien

═══ FUTTER-PROTOKOLL (letzte 30 Tage) ═══
${feedingLines || 'Keine Futter-Daten vorhanden.'}

═══ BEFINDEN-PROTOKOLL (letzte 30 Tage) ═══
${healthLines || 'Keine Befinden-Daten vorhanden.'}
${pantrySection}

Bitte analysiere und antworte auf Deutsch mit folgender Struktur:

**Muster & Korrelationen**
[Zusammenhänge zwischen Futter und Durchfall-Episoden]

**Protein-Analyse**
[Mono vs. Multi-Protein, welche Quellen überwiegen, Auffälligkeiten]

**Verträglichkeit**
[Welche Sorten gut oder schlecht verträglich?]

**Empfehlung nächste Mahlzeit**
[Basierend auf Vorrat, Protein-Rotation und Verträglichkeit]

Sei präzise. Maximal 280 Wörter. Falls zu wenig Daten: Sag das ehrlich.`

    const apiKey = process.env.GOOGLE_AI_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Analyse fehlgeschlagen', detail: 'GOOGLE_AI_KEY ist nicht gesetzt.' },
        { status: 500 },
      )
    }

    // Modellkette durchgehen: primäres Flash, dann Lite. Pro Modell ein zweiter
    // Versuch nach kurzem Backoff, falls es gerade überlastet ist.
    let lastDetail = 'Unbekannter Fehler'
    let lastOverloaded = false

    for (let m = 0; m < GEMINI_MODELS.length; m++) {
      const model = GEMINI_MODELS[m]
      const attempts = 2

      for (let a = 0; a < attempts; a++) {
        const result = await callGemini(model, apiKey, prompt)
        if (result.ok) {
          return NextResponse.json({ analysis: result.analysis })
        }

        lastDetail = result.detail
        lastOverloaded = result.overloaded

        // Nicht-transienter Fehler (z.B. ungültiger Key) → nicht weiter probieren
        if (!result.overloaded) {
          return NextResponse.json(
            { error: 'Analyse fehlgeschlagen', detail: lastDetail },
            { status: 500 },
          )
        }

        // Vor dem zweiten Versuch am selben Modell kurz warten
        if (a < attempts - 1) await sleep(1200)
      }
      // Modell dauerhaft überlastet → nächstes Modell in der Kette
    }

    // Alle Modelle überlastet → 503 mit retriable-Flag, Client versucht es automatisch erneut
    return NextResponse.json(
      {
        error: 'Analyse fehlgeschlagen',
        detail: 'Gemini ist gerade stark ausgelastet. Bitte gleich noch einmal versuchen.',
        retriable: lastOverloaded,
      },
      { status: 503 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('analyze-health error:', msg)
    return NextResponse.json({ error: 'Analyse fehlgeschlagen', detail: msg }, { status: 500 })
  }
}

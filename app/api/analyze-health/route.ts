import { NextRequest, NextResponse } from 'next/server'
import { CAT_PROFILE } from '@/lib/cat-profile'

const MENGE = ['nichts', 'sehr wenig', 'wenig', 'mittel', 'viel']
const STOOL: Record<string, string> = { normal: 'Normal', soft: 'Weich', diarrhea: 'DURCHFALL', not_observed: 'Nicht gesehen' }
const APPETITE: Record<string, string> = { good: 'Gut', reduced: 'Wenig', none: 'Gar nicht' }
const ACTIVITY: Record<string, string> = { normal: 'Normal', tired: 'Müde', very_active: 'Sehr aktiv' }

// gemini-1.5-* ist abgeschaltet, gemini-2.5-flash für neue Projekte gesperrt.
// gemini-flash-latest zeigt immer auf das aktuelle Flash-Modell.
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`

export async function POST(req: NextRequest) {
  try {
    const { feedings, health, pantry = [] } = await req.json()

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

    const prompt = `Du bist ein erfahrener Tiergesundheits-Assistent. Analysiere folgende Daten für ${CAT_PROFILE.name}, ${CAT_PROFILE.descriptionAccusative} mit wiederkehrendem Durchfall.

Zur Rasse: ${CAT_PROFILE.name} ist ${CAT_PROFILE.breed}. Als Langhaarrasse ist bei ihm Kot im Fell
ein relevantes Begleitproblem bei weichem Stuhl.

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

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
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
      console.error('Gemini API error:', err)
      return NextResponse.json({ error: 'Analyse fehlgeschlagen', detail: err }, { status: 500 })
    }

    const data = await res.json()
    const candidate = data.candidates?.[0]
    const analysis = candidate?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim()

    if (!analysis) {
      const reason = candidate?.finishReason ?? 'unbekannt'
      console.error('Gemini leere Antwort, finishReason:', reason, JSON.stringify(data.usageMetadata))
      return NextResponse.json(
        {
          error: 'Analyse fehlgeschlagen',
          detail: reason === 'MAX_TOKENS'
            ? 'Antwort-Budget aufgebraucht. Bitte erneut versuchen.'
            : `Keine Antwort erhalten (${reason}).`,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ analysis })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('analyze-health error:', msg)
    return NextResponse.json({ error: 'Analyse fehlgeschlagen', detail: msg }, { status: 500 })
  }
}

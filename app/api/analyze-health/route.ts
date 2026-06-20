import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!)

const MENGE = ['nichts', 'sehr wenig', 'wenig', 'mittel', 'viel']
const STOOL: Record<string, string> = { normal: 'Normal', soft: 'Weich', diarrhea: 'DURCHFALL', not_observed: 'Nicht gesehen' }
const APPETITE: Record<string, string> = { good: 'Gut', reduced: 'Wenig', none: 'Gar nicht' }
const ACTIVITY: Record<string, string> = { normal: 'Normal', tired: 'Müde', very_active: 'Sehr aktiv' }

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

    const prompt = `Du bist ein erfahrener Tiergesundheits-Assistent. Analysiere folgende Daten für Joschi, eine goldene Langhaar-Perserkatze mit wiederkehrendem Durchfall.

WICHTIG zu Proteinquellen:
- Mono-Protein = nur eine Fleischquelle (z.B. nur Truthahn) → besser bei Unverträglichkeiten, leichter zu diagnostizieren
- Multi-Protein = mehrere Fleischquellen (z.B. Lachs+Huhn+Rentier) → höheres Allergiepotenzial
- Protein-Rotation ist wichtig: nicht immer dieselbe Quelle
- Geflügel (Huhn, Truthahn, Ente) und Fisch (Lachs, Hering) sind unterschiedliche Proteinfamilien

═══ FUTTER-PROTOKOLL (letzte 30 Tage) ═══
${feedingLines || 'Keine Futter-Daten vorhanden.'}

═══ BEFINDEN-PROTOKOLL (letzte 30 Tage) ═══
${healthLines || 'Keine Befinden-Daten vorhanden.'}
${pantrySection}

Bitte analysiere und antworte auf Deutsch mit folgender Struktur:

**Muster & Korrelationen**
[Zusammenhänge zwischen Futter (besonders Mono/Multi-Protein) und Durchfall-Episoden]

**Protein-Analyse**
[Welche Proteinquellen überwiegen? Gibt es Auffälligkeiten bei Mono vs. Multi-Protein und der Verträglichkeit?]

**Verträglichkeit**
[Welche Sorten scheinen besser oder schlechter verträglich? Konkret mit Prozentzahlen wenn möglich]

**Empfehlung nächste Mahlzeit**
[Basierend auf Vorrat, Protein-Rotation und Verträglichkeit: Was sollte als nächstes gegeben werden und warum?]

Sei präzise. Maximal 280 Wörter. Falls zu wenig Daten: Sag das ehrlich.`

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })
    const result = await model.generateContent(prompt)
    const analysis = result.response.text()

    return NextResponse.json({ analysis })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('analyze-health error:', msg)
    return NextResponse.json({ error: 'Analyse fehlgeschlagen', detail: msg }, { status: 500 })
  }
}

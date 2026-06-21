import { NextRequest, NextResponse } from 'next/server'

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent`

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File
    if (!file) return NextResponse.json({ error: 'Kein Bild' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type || 'image/jpeg'

    const prompt = `Du analysierst ein Foto einer Katzenfutterdose.
Extrahiere folgende Informationen und antworte NUR mit einem JSON-Objekt, ohne Erklärungen:
{
  "brand": "Markenname (z.B. Anifit, Royal Canin, Whiskas)",
  "type": "Produktname/Sorte (vollständiger Name)",
  "amount_grams": Gewicht als Zahl ohne Einheit oder null wenn nicht erkennbar
}

Falls du die Dose nicht erkennen kannst, gib zurück: {"brand": "", "type": "", "amount_grams": null}`

    const res = await fetch(`${GEMINI_URL}?key=${process.env.GOOGLE_AI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { maxOutputTokens: 256, temperature: 0.1 },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini can error:', err)
      return NextResponse.json({ error: 'Analyse fehlgeschlagen', detail: err }, { status: 500 })
    }

    const data = await res.json()
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result = JSON.parse(json)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('analyze-can error:', msg)
    return NextResponse.json({ error: 'Analyse fehlgeschlagen', detail: msg }, { status: 500 })
  }
}

import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!)

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File
    if (!file) return NextResponse.json({ error: 'Kein Bild' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type || 'image/jpeg'

    const model = genAI.getGenerativeModel(
      { model: 'gemini-1.5-flash' },
      { apiVersion: 'v1' }
    )

    const result = await model.generateContent([
      {
        inlineData: { data: base64, mimeType },
      },
      `Du analysierst ein Foto einer Katzenfutterdose.
Extrahiere folgende Informationen und antworte NUR mit einem JSON-Objekt, ohne Erklärungen:
{
  "brand": "Markenname (z.B. Anifit, Royal Canin, Whiskas)",
  "type": "Produktname/Sorte (vollständiger Name)",
  "amount_grams": Gewicht als Zahl ohne Einheit oder null wenn nicht erkennbar
}

Falls du die Dose nicht erkennen kannst, gib zurück: {"brand": "", "type": "", "amount_grams": null}`,
    ])

    const text = result.response.text().trim()
    const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const data = JSON.parse(json)

    return NextResponse.json(data)
  } catch (err) {
    console.error('analyze-can error:', err)
    return NextResponse.json({ error: 'Analyse fehlgeschlagen' }, { status: 500 })
  }
}

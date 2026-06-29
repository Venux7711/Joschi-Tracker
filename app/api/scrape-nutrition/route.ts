import { NextRequest, NextResponse } from 'next/server'
import type { NutritionData } from '@/lib/types'

function extractPercent(text: string, ...labels: string[]): number | undefined {
  for (const label of labels) {
    const pattern = new RegExp(label + '[^\\d]{0,10}([\\d]+[,.]?[\\d]*)\\s*%', 'i')
    const m = text.match(pattern)
    if (m) return parseFloat(m[1].replace(',', '.'))
  }
}

function extractMg(text: string, ...labels: string[]): number | undefined {
  for (const label of labels) {
    const pattern = new RegExp(label + '[^\\d]{0,10}([\\d]+[,.]?[\\d]*)\\s*mg', 'i')
    const m = text.match(pattern)
    if (m) return parseFloat(m[1].replace(',', '.'))
  }
}

function extractGPerKg(text: string, ...labels: string[]): number | undefined {
  for (const label of labels) {
    const pattern = new RegExp(label + '[^\\d]{0,10}([\\d]+[,.]?[\\d]*)\\s*g\\s*/\\s*kg', 'i')
    const m = text.match(pattern)
    if (m) return parseFloat(m[1].replace(',', '.'))
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

async function scrapeViaFirecrawl(url: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url, formats: ['markdown'] }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await res.json()
  return data.data?.markdown ?? ''
}

async function scrapeDirect(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JoschiTracker/1.0; +https://joschi.app)' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  return stripHtml(html)
}

export async function POST(req: NextRequest) {
  let url: string
  try {
    const body = await req.json()
    url = body.url?.trim()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  if (!url || !url.startsWith('http')) {
    return NextResponse.json({ error: 'Bitte eine gültige URL eingeben (https://...)' }, { status: 400 })
  }

  let text = ''
  let pageTitle = ''

  try {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY
    if (firecrawlKey) {
      text = await scrapeViaFirecrawl(url, firecrawlKey)
    } else {
      text = await scrapeDirect(url)
    }

    // Try to extract page title from raw text
    const titleMatch = text.match(/#+\s*(.+)/) ?? text.match(/^(.{10,80})/m)
    if (titleMatch) pageTitle = titleMatch[1].trim().slice(0, 120)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: `Seite konnte nicht geladen werden: ${msg}` }, { status: 400 })
  }

  const nutrition: NutritionData = {}

  nutrition.protein = extractPercent(text,
    'Rohprotein', 'Eiweiß', 'Protein', 'Crude Protein', 'crude protein'
  )
  nutrition.fat = extractPercent(text,
    'Rohfett', 'Fett', 'Crude Fat', 'crude fat'
  )
  nutrition.fiber = extractPercent(text,
    'Rohfaser', 'Faser', 'Crude Fibre', 'Crude Fiber', 'crude fibre', 'crude fiber'
  )
  nutrition.moisture = extractPercent(text,
    'Feuchtigkeit', 'Moisture', 'moisture'
  )
  nutrition.ash = extractPercent(text,
    'Rohasche', 'Asche', 'Crude Ash', 'crude ash'
  )

  // Micronutrients
  nutrition.calcium = extractGPerKg(text, 'Calcium', 'Kalzium')
  nutrition.phosphorus = extractGPerKg(text, 'Phosphor', 'Phosphorus')
  nutrition.sodium = extractGPerKg(text, 'Natrium', 'Sodium')
  nutrition.magnesium = extractGPerKg(text, 'Magnesium')
  nutrition.taurine = extractMg(text, 'Taurin', 'Taurine')

  // Remove undefined keys
  for (const key of Object.keys(nutrition) as (keyof NutritionData)[]) {
    if (nutrition[key] === undefined) delete nutrition[key]
  }

  const hasData = Object.keys(nutrition).length > 0

  return NextResponse.json({
    title: pageTitle,
    nutrition: hasData ? nutrition : null,
    foundFields: Object.keys(nutrition),
  })
}

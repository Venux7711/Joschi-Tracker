import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getActiveCat, getCats } from '@/lib/active-cat.server'

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
}

const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

export async function GET(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = req.nextUrl.searchParams.get('year') ?? String(new Date().getFullYear() - 1)
  const start = `${year}-01-01T00:00:00`
  const end = `${year}-12-31T23:59:59`

  const cat = await getActiveCat(supabase)
  if (!cat) return NextResponse.json({ error: 'Keine Katze' }, { status: 404 })
  const catId = cat.id
  const allCatIds = (await getCats(supabase)).map((c) => c.id)

  // Fütterung geteilt (Haushalt), Befinden individuell (aktive Katze)
  const [feedRes, healthRes] = await Promise.all([
    supabase.from('feeding_logs').select('food_type, food_brand, amount_grams, logged_at').in('cat_id', allCatIds).gte('logged_at', start).lte('logged_at', end),
    supabase.from('health_logs').select('stool_consistency, logged_at').eq('cat_id', catId).gte('logged_at', start).lte('logged_at', end),
  ])

  const feedings = feedRes.data ?? []
  const healthLogs = healthRes.data ?? []

  // Total feedings
  const totalFeedings = feedings.length

  // Top food
  const foodCounts: Record<string, number> = {}
  feedings.forEach(f => { if (f.food_type) foodCounts[f.food_type] = (foodCounts[f.food_type] ?? 0) + 1 })
  const topFood = Object.entries(foodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unbekannt'
  const topFoodCount = foodCounts[topFood] ?? 0

  // Total grams
  const totalGrams = feedings.reduce((sum, f) => sum + (f.amount_grams ?? 0), 0)

  // Protein variety
  const proteins = new Set<string>()
  feedings.forEach(f => {
    if (!f.food_type) return
    const t = f.food_type.toLowerCase()
    if (t.includes('truthahn')) proteins.add('Truthahn')
    if (t.includes('huhn') || t.includes('hähnchen')) proteins.add('Huhn')
    if (t.includes('ente')) proteins.add('Ente')
    if (t.includes('rind')) proteins.add('Rind')
    if (t.includes('lamm')) proteins.add('Lamm')
    if (t.includes('lachs')) proteins.add('Lachs')
    if (t.includes('hering')) proteins.add('Hering')
    if (t.includes('weißfisch')) proteins.add('Weißfisch')
    if (t.includes('rentier')) proteins.add('Rentier')
    if (t.includes('fisch')) proteins.add('Fisch')
  })

  // Streak calculation (longest run without diarrhea)
  const diarrheaDays = new Set(
    healthLogs.filter(h => h.stool_consistency === 'diarrhea').map(h => h.logged_at.slice(0, 10))
  )
  let longestStreak = 0
  let currentStreak = 0
  const startDate = new Date(`${year}-01-01`)
  const endDate = new Date(`${year}-12-31`)
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    if (!diarrheaDays.has(key)) {
      currentStreak++
      longestStreak = Math.max(longestStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  }

  // Good days percent
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1
  const goodDays = totalDays - diarrheaDays.size
  const goodDaysPercent = Math.round((goodDays / totalDays) * 100)

  // Best month (fewest diarrhea days)
  const diarrheaByMonth: number[] = Array(12).fill(0)
  diarrheaDays.forEach(d => {
    const month = parseInt(d.slice(5, 7)) - 1
    diarrheaByMonth[month]++
  })
  const bestMonthIdx = diarrheaByMonth.indexOf(Math.min(...diarrheaByMonth))
  const bestMonth = MONTH_NAMES[bestMonthIdx]

  // Total health entries
  const totalHealthEntries = healthLogs.length
  const totalEntries = totalFeedings + totalHealthEntries

  return NextResponse.json({
    year,
    totalFeedings,
    topFood,
    topFoodCount,
    totalGrams,
    proteins: Array.from(proteins),
    longestStreak,
    goodDaysPercent,
    goodDays,
    totalDays,
    bestMonth,
    totalEntries,
    totalHealthEntries,
  })
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import {
  formatTime,
  isSameDay,
  getStoolLabel,
  getStoolColor,
  getAppetiteLabel,
  getActivityLabel,
} from '@/lib/utils'
import type { FeedingLog, HealthLog, PantryItem, StoolConsistency } from '@/lib/types'
import AiInsights from '@/components/AiInsights'
import { ANIFIT_FOODS, getFoodInfo, getProteinLabel, getProteinBadgeColor } from '@/lib/food-data'

function getPastNDays(n: number): Date[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return d
  })
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2)
}

function stoolDotBg(v: StoolConsistency | undefined): string {
  if (!v) return 'bg-gray-100 border-2 border-dashed border-gray-200'
  return {
    normal: 'bg-green-400',
    soft: 'bg-yellow-400',
    diarrhea: 'bg-red-500',
    not_observed: 'bg-gray-300',
  }[v]
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Katze holen oder anlegen
  let { data: cats } = await supabase.from('cats').select('*').eq('owner_id', user.id).limit(1)
  let cat = cats?.[0]
  if (!cat) {
    const { data: newCat } = await supabase.from('cats').insert({ name: 'Joschi', owner_id: user.id }).select().single()
    cat = newCat
  }
  if (!cat) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Fehler beim Laden. Seite neu laden.</p>
    </div>
  )

  // Datumsrahmen
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29); thirtyDaysAgo.setHours(0, 0, 0, 0)

  // Alle Daten auf einmal holen
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); sevenDaysAgo.setHours(0, 0, 0, 0)
  const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 2); threeDaysAgo.setHours(0, 0, 0, 0)

  const [
    { data: todayFeedingsRaw },
    { data: todayHealthRaw },
    { data: allHealth30 },
    { data: allFeedings30 },
    { data: pantryRaw },
  ] = await Promise.all([
    supabase.from('feeding_logs').select('*').eq('cat_id', cat.id)
      .gte('logged_at', todayStart.toISOString()).lte('logged_at', todayEnd.toISOString())
      .order('logged_at', { ascending: true }),
    supabase.from('health_logs').select('*').eq('cat_id', cat.id)
      .gte('logged_at', todayStart.toISOString()).lte('logged_at', todayEnd.toISOString())
      .order('logged_at', { ascending: false }),
    supabase.from('health_logs').select('*')
      .eq('cat_id', cat.id).gte('logged_at', thirtyDaysAgo.toISOString())
      .order('logged_at', { ascending: false }),
    supabase.from('feeding_logs').select('*')
      .eq('cat_id', cat.id).gte('logged_at', thirtyDaysAgo.toISOString())
      .order('logged_at', { ascending: true }),
    supabase.from('pantry_items').select('*').eq('cat_id', cat.id).gt('quantity', 0),
  ])

  const feedings = (todayFeedingsRaw ?? []) as FeedingLog[]
  const healthLogs = (todayHealthRaw ?? []) as HealthLog[]
  const health30 = (allHealth30 ?? []) as HealthLog[]
  const feedings30 = (allFeedings30 ?? []) as FeedingLog[]
  const pantry = (pantryRaw ?? []) as PantryItem[]

  // === Statistiken berechnen ===

  const past30 = getPastNDays(30)
  const past14 = getPastNDays(14)

  // 30-Tage Durchfall-Tage
  const diarrhea30Days = past30.filter(day =>
    health30.some(h => isSameDay(new Date(h.logged_at), day) && h.stool_consistency === 'diarrhea')
  ).length

  // Durchfall-freie Streak (Tage zurück ohne Durchfall-Eintrag)
  let streak = 0
  for (let i = past30.length - 1; i >= 0; i--) {
    const day = past30[i]
    const dayLogs = health30.filter(h => isSameDay(new Date(h.logged_at), day))
    const hasDiarrhea = dayLogs.some(h => h.stool_consistency === 'diarrhea')
    if (hasDiarrhea) break
    if (dayLogs.length > 0) streak++
  }

  // 14-Tage Stuhlgang-Trend
  const trend14 = past14.map(day => {
    const dayLogs = health30.filter(h => isSameDay(new Date(h.logged_at), day))
    // Schlechtester Wert des Tages (diarrhea > soft > normal > not_observed)
    const priority: Record<StoolConsistency, number> = { diarrhea: 3, soft: 2, normal: 1, not_observed: 0 }
    const worst = dayLogs.reduce<StoolConsistency | undefined>((acc, h) => {
      if (!acc) return h.stool_consistency
      return priority[h.stool_consistency] > priority[acc] ? h.stool_consistency : acc
    }, undefined)
    return { day, stool: worst }
  })

  // Aktuellster Stuhlgang
  const latestStool = health30.length > 0 ? health30[0].stool_consistency : undefined

  // Erbrech-Tage in letzten 7 Tagen
  const past7 = getPastNDays(7)
  const vomiting7Days = past7.filter(day =>
    health30.some(h => isSameDay(new Date(h.logged_at), day) && h.vomiting)
  ).length

  // === Futter-Diarrhoe-Korrelation ===
  // Für jede Futter-Sorte: wie oft gegessen, wie oft am gleichen/nächsten Tag Durchfall
  type FoodStat = { brand: string; type: string; total: number; diarrhea: number }
  const foodMap = new Map<string, FoodStat>()

  for (const f of feedings30) {
    const key = `${f.food_brand}||${f.food_type}`
    const fDay = new Date(f.logged_at)
    const nextDay = new Date(fDay); nextDay.setDate(nextDay.getDate() + 1)

    const hasDiarrhea = health30.some(h => {
      const hDay = new Date(h.logged_at)
      return (isSameDay(hDay, fDay) || isSameDay(hDay, nextDay)) && h.stool_consistency === 'diarrhea'
    })

    if (!foodMap.has(key)) foodMap.set(key, { brand: f.food_brand, type: f.food_type, total: 0, diarrhea: 0 })
    const stat = foodMap.get(key)!
    stat.total++
    if (hasDiarrhea) stat.diarrhea++
  }

  const foodCorrelation = Array.from(foodMap.values())
    .filter(s => s.total >= 2)
    .sort((a, b) => (b.diarrhea / b.total) - (a.diarrhea / a.total))
    .slice(0, 6)

  // === Futter-Empfehlung aus Vorrat ===
  // Proteine der letzten 7 Tage ermitteln
  const recentFeedings7 = feedings30.filter(f => new Date(f.logged_at) >= sevenDaysAgo)
  const recentProteins = new Set(
    recentFeedings7.flatMap(f => getFoodInfo(f.food_brand, f.food_type)?.proteins ?? [])
  )
  // Diarrhoe letzte 3 Tage?
  const recentDiarrhea = health30.some(h =>
    new Date(h.logged_at) >= threeDaysAgo && h.stool_consistency === 'diarrhea'
  )

  type FoodRec = {
    item: PantryItem
    info: ReturnType<typeof getFoodInfo>
    score: number
    reasons: string[]
  }

  const scored: FoodRec[] = pantry.map(item => {
    const info = getFoodInfo(item.brand, item.type)
    const proteins = info?.proteins ?? []
    const newProteins = proteins.filter(p => !recentProteins.has(p))
    const corrKey = `${item.brand}||${item.type}`
    const corr = foodMap.get(corrKey)
    const diarrheaRate = corr ? corr.diarrhea / corr.total : 0

    const reasons: string[] = []
    let score = 0

    if (newProteins.length > 0) {
      score += 10
      reasons.push(`Neue Proteinquelle: ${newProteins.join(', ')}`)
    } else {
      reasons.push(`Protein zuletzt gegeben: ${proteins.join(', ')}`)
    }

    if (info?.proteinType === 'mono') {
      score += recentDiarrhea ? 8 : 3
      if (recentDiarrhea) reasons.push('Mono-Protein bevorzugt (kürzlicher Durchfall)')
    }

    if (diarrheaRate === 0 && corr && corr.total >= 2) {
      score += 5
      reasons.push('Bisher kein Durchfall nach diesem Futter')
    } else if (diarrheaRate > 0.5) {
      score -= 8
      reasons.push(`Hohe Durchfall-Korrelation (${Math.round(diarrheaRate * 100)}%)`)
    }

    return { item, info, score, reasons }
  }).sort((a, b) => b.score - a.score)

  const recommendation = scored[0] ?? null

  // KI-Daten – jetzt mit Vorrat und Proteininfo
  const aiPantry = pantry.map(p => {
    const info = getFoodInfo(p.brand, p.type)
    return `${p.type} (${info ? getProteinLabel(info) : p.brand}) – ${p.quantity} Dose${p.quantity !== 1 ? 'n' : ''}`
  })

  // Daten für KI aufbereiten
  const aiFeedings = feedings30.map(f => ({
    date: new Date(f.logged_at).toLocaleDateString('de-DE'),
    brand: f.food_brand,
    type: f.food_type,
    grams: f.amount_grams ?? undefined,
    treat: (f as FeedingLog & { treat_amount?: number }).treat_amount ?? undefined,
    dry: (f as FeedingLog & { dry_food_amount?: number }).dry_food_amount ?? undefined,
    extras: (f as FeedingLog & { extras?: string }).extras ?? undefined,
  }))

  const aiHealth = health30.map(h => ({
    date: new Date(h.logged_at).toLocaleDateString('de-DE'),
    stool: h.stool_consistency,
    appetite: h.appetite,
    activity: h.activity,
    vomiting: h.vomiting,
    furIssue: h.fur_issue,
    notes: h.notes ?? undefined,
  }))

  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Guten Morgen' : today.getHours() < 17 ? 'Guten Tag' : 'Guten Abend'

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">

        {/* ── HERO ── */}
        <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-3xl p-5 flex items-center gap-4 shadow-md">
          <div className="relative w-20 h-20 rounded-full overflow-hidden border-4 border-white/60 shadow-lg flex-shrink-0">
            <Image src="/joschi.jpg" alt="Joschi" fill className="object-cover object-top" priority />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-100 text-sm">{greeting} 👋</p>
            <h1 className="text-white text-2xl font-bold">Joschi</h1>
            <p className="text-amber-100 text-sm">
              {today.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-white/80 text-xs mb-0.5">Heute</div>
            <div className="text-white text-2xl font-bold">{feedings.length}×</div>
            <div className="text-amber-100 text-xs">Mahlzeiten</div>
          </div>
        </div>

        {/* ── FUTTER-EMPFEHLUNG ── */}
        {recommendation && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-100 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-amber-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">🎯 Empfehlung für heute</h3>
                <p className="text-xs text-gray-400 mt-0.5">Basierend auf Vorrat, Protein-Rotation & Verträglichkeit</p>
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-gray-800 leading-tight">
                    {recommendation.item.type || recommendation.item.brand}
                  </p>
                  {recommendation.info && (
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${getProteinBadgeColor(recommendation.info)}`}>
                      {getProteinLabel(recommendation.info)}
                    </span>
                  )}
                  <div className="mt-2 space-y-0.5">
                    {recommendation.reasons.slice(0, 2).map((r, i) => (
                      <p key={i} className="text-xs text-gray-500 flex items-start gap-1">
                        <span className="text-amber-400 mt-px">›</span>{r}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-2xl font-bold text-amber-600">{recommendation.item.quantity}</span>
                  <p className="text-[10px] text-gray-400">im Vorrat</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STATS KARTEN ── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Streak */}
          <div className={`rounded-2xl p-4 ${streak >= 3 ? 'bg-green-50 border border-green-100' : streak > 0 ? 'bg-amber-50 border border-amber-100' : 'bg-red-50 border border-red-100'}`}>
            <div className={`text-3xl font-bold ${streak >= 3 ? 'text-green-600' : streak > 0 ? 'text-amber-600' : 'text-red-500'}`}>
              {streak}
            </div>
            <div className="text-sm font-medium text-gray-700 mt-0.5">Tage ohne Durchfall</div>
            <div className="text-xs text-gray-400 mt-1">
              {streak === 0 ? 'Zuletzt Durchfall' : streak === 1 ? 'Heute gut ✓' : `${streak} Tage in Folge ✓`}
            </div>
          </div>

          {/* 30-Tage Durchfall */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className={`text-3xl font-bold ${diarrhea30Days === 0 ? 'text-green-600' : diarrhea30Days <= 5 ? 'text-amber-500' : 'text-red-500'}`}>
              {diarrhea30Days}
            </div>
            <div className="text-sm font-medium text-gray-700 mt-0.5">Durchfall-Tage</div>
            <div className="text-xs text-gray-400 mt-1">letzte 30 Tage · {30 - diarrhea30Days} gut</div>
          </div>

          {/* Aktueller Stuhl */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            {latestStool ? (
              <>
                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-1 ${getStoolColor(latestStool)}`}>
                  {getStoolLabel(latestStool)}
                </span>
                <div className="text-sm font-medium text-gray-700">Letzter Stuhlgang</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(health30[0]?.logged_at ?? '').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-gray-300">–</div>
                <div className="text-sm font-medium text-gray-700 mt-0.5">Kein Befund</div>
                <div className="text-xs text-gray-400 mt-1">noch nichts eingetragen</div>
              </>
            )}
          </div>

          {/* Erbrechen 7 Tage */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className={`text-3xl font-bold ${vomiting7Days === 0 ? 'text-green-600' : 'text-red-500'}`}>
              {vomiting7Days}×
            </div>
            <div className="text-sm font-medium text-gray-700 mt-0.5">Erbrochen</div>
            <div className="text-xs text-gray-400 mt-1">letzte 7 Tage</div>
          </div>
        </div>

        {/* ── 14-TAGE STUHLGANG-TREND ── */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">14-Tage Stuhlgang-Trend</h3>
          <div className="flex gap-1 justify-between">
            {trend14.map(({ day, stool }, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                <div className={`w-full aspect-square rounded-full ${stoolDotBg(stool)} min-w-[14px]`} />
                <span className="text-[9px] text-gray-400 leading-none">{dayLabel(day)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-3 flex-wrap">
            {[
              { label: 'Normal', cls: 'bg-green-400' },
              { label: 'Weich', cls: 'bg-yellow-400' },
              { label: 'Durchfall', cls: 'bg-red-500' },
              { label: 'Nicht gesehen', cls: 'bg-gray-300' },
            ].map(({ label, cls }) => (
              <span key={label} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className={`w-2.5 h-2.5 rounded-full ${cls} inline-block`} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── HEUTE: FUTTER ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">🍽️ Futter heute</h3>
            <Link href="/feeding/new" className="text-xs font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors">
              + Eintrag
            </Link>
          </div>

          {feedings.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-gray-400">Noch kein Futter eingetragen</p>
              <Link href="/feeding/new" className="inline-block mt-2 text-sm text-amber-600 font-medium">Jetzt eintragen →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {feedings.map((f) => (
                <div key={f.id} className="flex items-center px-4 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{f.food_brand}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {f.food_type}{f.amount_grams ? ` · ${f.amount_grams}g` : ''} · {formatTime(f.logged_at)}
                    </p>
                  </div>
                  <Link
                    href={`/feeding/${f.id}/edit`}
                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors text-base"
                  >
                    ✏️
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── HEUTE: BEFINDEN ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">💊 Befinden heute</h3>
            <Link href="/health/new" className="text-xs font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors">
              + Eintrag
            </Link>
          </div>

          {healthLogs.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-gray-400">Noch kein Befinden eingetragen</p>
              <Link href="/health/new" className="inline-block mt-2 text-sm text-amber-600 font-medium">Jetzt eintragen →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {healthLogs.map((h) => (
                <div key={h.id} className="flex items-center px-4 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStoolColor(h.stool_consistency)}`}>
                        {getStoolLabel(h.stool_consistency)}
                      </span>
                      {h.vomiting && <span className="text-xs text-red-500 font-medium">⚠ Erbrochen</span>}
                      {h.fur_issue && <span className="text-xs text-orange-500 font-medium">⚠ Fell</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Appetit: {getAppetiteLabel(h.appetite)} · {getActivityLabel(h.activity)} · {formatTime(h.logged_at)}
                    </p>
                    {h.notes && <p className="text-xs text-gray-400 italic mt-0.5 truncate">{h.notes}</p>}
                  </div>
                  <Link
                    href={`/health/${h.id}/edit`}
                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors text-base"
                  >
                    ✏️
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── FUTTER-KORRELATION ── */}
        {foodCorrelation.length >= 2 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">📊 Futter & Durchfall</h3>
              <p className="text-xs text-gray-400 mt-0.5">Wie oft trat Durchfall am selben oder nächsten Tag auf?</p>
            </div>
            <div className="px-4 py-3 space-y-2.5">
              {foodCorrelation.map((s) => {
                const pct = Math.round((s.diarrhea / s.total) * 100)
                const barColor = pct >= 60 ? 'bg-red-400' : pct >= 30 ? 'bg-yellow-400' : 'bg-green-400'
                const info = getFoodInfo(s.brand, s.type)
                return (
                  <div key={`${s.brand}||${s.type}`}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs text-gray-700 truncate">{s.type || s.brand}</span>
                        {info && (
                          <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full flex-shrink-0 ${getProteinBadgeColor(info)}`}>
                            {info.proteinType === 'mono' ? 'Mono' : 'Multi'}
                          </span>
                        )}
                      </div>
                      <span className={`text-xs font-semibold flex-shrink-0 ${pct >= 60 ? 'text-red-500' : pct >= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {pct}% <span className="text-gray-400 font-normal">({s.diarrhea}/{s.total}×)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="px-4 pb-3 text-[10px] text-gray-300">Nur Sorten mit ≥2 Einträgen · Korrelation ≠ Kausalität</p>
          </div>
        )}

        {/* ── KI-AUSWERTUNG ── */}
        <AiInsights feedings={aiFeedings} health={aiHealth} pantry={aiPantry} />

        {/* ── QUICK ACTIONS ── */}
        <div className="grid grid-cols-2 gap-3 pb-4">
          <Link href="/feeding/new" className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-2xl p-4 flex items-center gap-3 transition-colors shadow-sm">
            <span className="text-2xl">🍽️</span>
            <div>
              <div className="font-semibold text-sm">Futter</div>
              <div className="text-amber-100 text-xs">eintragen</div>
            </div>
          </Link>
          <Link href="/health/new" className="bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 rounded-2xl p-4 flex items-center gap-3 transition-colors border border-gray-100 shadow-sm">
            <span className="text-2xl">💊</span>
            <div>
              <div className="font-semibold text-sm">Befinden</div>
              <div className="text-gray-400 text-xs">eintragen</div>
            </div>
          </Link>
        </div>

      </main>
    </div>
  )
}

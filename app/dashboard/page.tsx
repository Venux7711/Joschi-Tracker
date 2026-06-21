import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
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
import JoschiPhoto from '@/components/JoschiPhoto'
import MemoryOfTheDay from '@/components/MemoryOfTheDay'
import PushNotification from '@/components/PushNotification'
import WeightWidget from '@/components/WeightWidget'
import MedicationsWidget from '@/components/MedicationsWidget'
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
  let { data: cats } = await supabase.from('cats').select('*').limit(1)
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
    streak++ // kein Eintrag = alles normal
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

  // === Futter-Empfehlung (Vorrat oder alle Anifit-Sorten) ===
  const recentFeedings7 = feedings30.filter(f => new Date(f.logged_at) >= sevenDaysAgo)
  const recentFeedings3 = feedings30.filter(f => new Date(f.logged_at) >= threeDaysAgo)
  const todayFoodKeys = new Set(feedings.map(f => `${f.food_brand}||${f.food_type}`))

  const recentProteins7 = new Set(
    recentFeedings7.flatMap(f => getFoodInfo(f.food_brand, f.food_type)?.proteins ?? [])
  )
  const recentFamilies3 = new Set(
    recentFeedings3.flatMap(f => getFoodInfo(f.food_brand, f.food_type)?.proteinFamily ?? [])
  )
  const recentDiarrhea = health30.some(h =>
    new Date(h.logged_at) >= threeDaysAgo && h.stool_consistency === 'diarrhea'
  )
  const softOrDiarrhea7 = health30.some(h =>
    new Date(h.logged_at) >= sevenDaysAgo &&
    (h.stool_consistency === 'diarrhea' || h.stool_consistency === 'soft')
  )

  type FoodRecCandidate = {
    brand: string; type: string; inPantry: boolean; quantity?: number
    info: ReturnType<typeof getFoodInfo>; score: number; reasons: string[]; warnings: string[]
  }

  // Kandidaten: Vorrat zuerst, dann alle Anifit-Sorten als Ergänzung
  const pantryKeys = new Set(pantry.map(p => `${p.brand}||${p.type}`))
  const candidates: Array<{ brand: string; type: string; inPantry: boolean; quantity?: number }> = [
    ...pantry.map(p => ({ brand: p.brand, type: p.type, inPantry: true, quantity: p.quantity })),
    ...ANIFIT_FOODS.filter(f => !pantryKeys.has(`${f.brand}||${f.type}`))
      .map(f => ({ brand: f.brand, type: f.type, inPantry: false })),
  ]

  const recommendations: FoodRecCandidate[] = candidates.map(c => {
    const info = getFoodInfo(c.brand, c.type)
    const proteins = info?.proteins ?? []
    const families = info?.proteinFamily ?? []
    const corrKey = `${c.brand}||${c.type}`
    const corr = foodMap.get(corrKey)
    const diarrheaRate = corr ? corr.diarrhea / corr.total : null
    const givenToday = todayFoodKeys.has(corrKey)

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    // Vorrat bevorzugen
    if (c.inPantry) score += 15

    // Neue Proteinquelle (nicht in letzten 7 Tagen)
    const newProteins = proteins.filter(p => !recentProteins7.has(p))
    if (newProteins.length === proteins.length) {
      score += 12
      reasons.push(`Frische Proteinquelle: ${proteins.join(' + ')}`)
    } else if (newProteins.length > 0) {
      score += 6
      reasons.push(`Teilweise neue Proteine: ${newProteins.join(', ')}`)
    }

    // Neue Proteinfamilie (nicht in letzten 3 Tagen)
    const newFamilies = families.filter(f => !recentFamilies3.has(f))
    if (newFamilies.length > 0) {
      score += 5
      reasons.push(`Andere Proteinfamilie: ${newFamilies.join('/')}`)
    }

    // Mono-Protein bei Verdauungsproblemen
    if (info?.proteinType === 'mono') {
      if (recentDiarrhea) {
        score += 10
        reasons.push('Mono-Protein → leichter verdaulich bei Durchfall')
      } else if (softOrDiarrhea7) {
        score += 5
        reasons.push('Mono-Protein → empfehlenswert bei weichem Stuhl')
      } else {
        score += 2
        reasons.push('Mono-Protein → gut für Diagnostik')
      }
    } else if (info?.proteinType === 'multi') {
      if (recentDiarrhea) {
        score -= 4
        warnings.push('Multi-Protein bei Durchfall weniger geeignet')
      }
    }

    // Verträglichkeits-Historie
    if (diarrheaRate !== null && corr) {
      if (diarrheaRate === 0 && corr.total >= 3) {
        score += 8
        reasons.push(`Sehr gute Verträglichkeit (${corr.total}× gegeben, 0% Durchfall)`)
      } else if (diarrheaRate === 0 && corr.total >= 1) {
        score += 3
        reasons.push(`Bisher verträglich (${corr.total}× gegeben)`)
      } else if (diarrheaRate > 0.6) {
        score -= 12
        warnings.push(`Schlechte Verträglichkeit: ${Math.round(diarrheaRate * 100)}% Durchfall-Rate`)
      } else if (diarrheaRate > 0.3) {
        score -= 5
        warnings.push(`Mäßige Verträglichkeit: ${Math.round(diarrheaRate * 100)}% Durchfall-Rate`)
      }
    } else {
      // Noch nie gegeben → interessant ausprobieren
      score += 3
      reasons.push('Noch nicht getestet → wertvolle Datenpunkt')
    }

    // Heute schon gegeben → abwerten
    if (givenToday) {
      score -= 8
      warnings.push('Heute bereits gegeben')
    }

    return { ...c, info, score, reasons, warnings }
  }).sort((a, b) => b.score - a.score)

  const topRecs = recommendations.slice(0, 3)
  const bestRec = topRecs[0] ?? null

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

  // === Fütterungs-Statistik: Sorten der letzten 30 Tage ===
  type FoodFreq = { brand: string; type: string; count: number; lastDate: Date }
  const freqMap = new Map<string, FoodFreq>()
  for (const f of feedings30) {
    const key = `${f.food_brand}||${f.food_type}`
    const d = new Date(f.logged_at)
    if (!freqMap.has(key)) freqMap.set(key, { brand: f.food_brand, type: f.food_type, count: 0, lastDate: d })
    const entry = freqMap.get(key)!
    entry.count++
    if (d > entry.lastDate) entry.lastDate = d
  }
  const foodFrequency = Array.from(freqMap.values())
    .sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime())

  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Guten Morgen' : today.getHours() < 17 ? 'Guten Tag' : 'Guten Abend'

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* ── HERO ── */}
        <div
          className="rounded-3xl p-5 flex items-center gap-4 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1C1C1E 0%, #3A200A 60%, #78350F 100%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.20)',
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #FBBF24 0%, transparent 60%)' }}
          />
          <JoschiPhoto size={76} />
          <div className="flex-1 min-w-0 relative">
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: 2 }}>
              {greeting}
            </p>
            <h1 style={{ color: 'white', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
              Joschi
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 4, letterSpacing: '-0.01em' }}>
              {today.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="text-right flex-shrink-0 relative">
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>
              Heute
            </div>
            <div style={{ color: '#FBBF24', fontSize: 36, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>
              {feedings.length}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: '0.02em', fontWeight: 500 }}>
              Mahlzeiten
            </div>
          </div>
        </div>

        {/* ── QUICK ACTIONS ── */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/feeding/new"
            className="rounded-2xl p-4 flex items-center gap-3 transition-all active:scale-95"
            style={{
              background: 'linear-gradient(145deg, #FBBF24 0%, #D97706 100%)',
              boxShadow: '0 4px 16px rgba(217,119,6,0.28)',
            }}
          >
            <span style={{ fontSize: 26 }}>🍽️</span>
            <div>
              <div style={{ color: 'white', fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Futter</div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>eintragen</div>
            </div>
          </Link>
          <Link
            href="/health/new"
            className="card rounded-2xl p-4 flex items-center gap-3 transition-all active:scale-95"
          >
            <span style={{ fontSize: 26 }}>🩺</span>
            <div>
              <div style={{ color: '#1C1C1E', fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Befinden</div>
              <div style={{ color: 'rgba(60,60,67,0.45)', fontSize: 12 }}>eintragen</div>
            </div>
          </Link>
        </div>

        {/* ── FUTTER-EMPFEHLUNG ── */}
        {bestRec && (
          <div className="card overflow-hidden">
            <div className="px-4 pt-4 pb-3" style={{ borderBottom: '0.5px solid rgba(60,60,67,0.1)' }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 16 }}>🎯</span>
                <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: '#1C1C1E' }}>Empfehlung heute</h3>
              </div>
              <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', marginTop: 2, letterSpacing: '0.01em' }}>Protein-Rotation · Verträglichkeit · {pantry.length > 0 ? 'Vorrat' : 'Alle Anifit-Sorten'}</p>
            </div>

            {/* Beste Empfehlung */}
            <div className="px-4 pt-3 pb-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-bold text-gray-800">{bestRec.type}</p>
                    {bestRec.inPantry && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">im Vorrat</span>
                    )}
                  </div>
                  {bestRec.info && (
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${getProteinBadgeColor(bestRec.info)}`}>
                      {getProteinLabel(bestRec.info)}
                    </span>
                  )}
                  <div className="mt-2 space-y-1">
                    {bestRec.reasons.map((r, i) => (
                      <p key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                        <span className="text-green-500 mt-px font-bold">✓</span>{r}
                      </p>
                    ))}
                    {bestRec.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-600 flex items-start gap-1.5">
                        <span className="mt-px">⚠</span>{w}
                      </p>
                    ))}
                  </div>
                </div>
                {bestRec.inPantry && bestRec.quantity !== undefined && (
                  <div className="flex-shrink-0 text-right">
                    <span className="text-2xl font-bold text-amber-600">{bestRec.quantity}</span>
                    <p className="text-[10px] text-gray-400">Dosen</p>
                  </div>
                )}
              </div>
            </div>

            {/* Alternativen */}
            {topRecs.length > 1 && (
              <div className="mx-4 mb-3 pt-2" style={{ borderTop: '0.5px solid rgba(60,60,67,0.08)' }}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Alternativen</p>
                <div className="space-y-1.5">
                  {topRecs.slice(1).map((rec, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-700 truncate">{rec.type}</span>
                          {rec.inPantry && <span className="text-[9px] text-amber-600 font-medium flex-shrink-0">●</span>}
                          {rec.info && (
                            <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full flex-shrink-0 ${getProteinBadgeColor(rec.info)}`}>
                              {rec.info.proteinType === 'mono' ? 'Mono' : 'Multi'}
                            </span>
                          )}
                        </div>
                        {rec.reasons[0] && (
                          <p className="text-[10px] text-gray-400 truncate">{rec.reasons[0]}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="px-4 pb-2 text-[10px] text-gray-300">● = im Vorrat</p>
          </div>
        )}

        {/* ── STATS KARTEN ── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Streak */}
          <div className="card p-4">
            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 1,
                color: streak >= 3 ? '#16A34A' : streak > 0 ? '#D97706' : '#DC2626',
              }}
            >
              {streak}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', marginTop: 4, letterSpacing: '-0.01em' }}>
              Tage kein Durchfall
            </div>
            <div style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', marginTop: 2 }}>
              {streak === 0 ? 'Zuletzt Durchfall' : streak === 1 ? 'Heute gut ✓' : `${streak} Tage in Folge ✓`}
            </div>
          </div>

          {/* 30-Tage Durchfall */}
          <div className="card p-4">
            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 1,
                color: diarrhea30Days === 0 ? '#16A34A' : diarrhea30Days <= 5 ? '#D97706' : '#DC2626',
              }}
            >
              {diarrhea30Days}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', marginTop: 4, letterSpacing: '-0.01em' }}>
              Durchfall-Tage
            </div>
            <div style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', marginTop: 2 }}>
              letzte 30 Tage · {30 - diarrhea30Days} gut
            </div>
          </div>

          {/* Aktueller Stuhl */}
          <div className="card p-4">
            {latestStool ? (
              <>
                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-2 ${getStoolColor(latestStool)}`}>
                  {getStoolLabel(latestStool)}
                </span>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', letterSpacing: '-0.01em' }}>Letzter Stuhlgang</div>
                <div style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', marginTop: 2 }}>
                  {new Date(health30[0]?.logged_at ?? '').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 30, fontWeight: 700, color: 'rgba(60,60,67,0.2)' }}>–</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', marginTop: 4 }}>Kein Befund</div>
                <div style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', marginTop: 2 }}>noch nichts eingetragen</div>
              </>
            )}
          </div>

          {/* Erbrechen 7 Tage */}
          <div className="card p-4">
            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 1,
                color: vomiting7Days === 0 ? '#16A34A' : '#DC2626',
              }}
            >
              {vomiting7Days}×
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', marginTop: 4, letterSpacing: '-0.01em' }}>
              Erbrochen
            </div>
            <div style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', marginTop: 2 }}>letzte 7 Tage</div>
          </div>
        </div>

        {/* ── 14-TAGE STUHLGANG-TREND ── */}
        <div className="card p-4">
          <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: '#1C1C1E', marginBottom: 12 }}>14-Tage Stuhlgang-Trend</h3>
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
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '0.5px solid rgba(60,60,67,0.1)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: '#1C1C1E' }}>🍽️ Futter heute</h3>
            <Link
              href="/feeding/new"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#D97706',
                background: 'rgba(217,119,6,0.08)',
                padding: '5px 12px',
                borderRadius: 999,
                letterSpacing: '-0.01em',
              }}
            >
              + Eintrag
            </Link>
          </div>

          {feedings.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p style={{ fontSize: 14, color: 'rgba(60,60,67,0.4)' }}>Noch kein Futter eingetragen</p>
              <Link href="/feeding/new" style={{ display: 'inline-block', marginTop: 6, fontSize: 14, color: '#D97706', fontWeight: 600 }}>
                Jetzt eintragen →
              </Link>
            </div>
          ) : (
            <div>
              {feedings.map((f, i) => (
                <div
                  key={f.id}
                  className="flex items-center px-4 py-3 gap-3"
                  style={i > 0 ? { borderTop: '0.5px solid rgba(60,60,67,0.07)' } : {}}
                >
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1E', letterSpacing: '-0.01em' }} className="truncate">
                      {f.food_brand}
                    </p>
                    <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)', marginTop: 1 }} className="truncate">
                      {f.food_type}{f.amount_grams ? ` · ${f.amount_grams}g` : ''} · {formatTime(f.logged_at)}
                    </p>
                  </div>
                  <Link
                    href={`/feeding/${f.id}/edit`}
                    className="flex-shrink-0 flex items-center justify-center transition-colors"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: 'rgba(120,120,128,0.08)',
                      fontSize: 14,
                    }}
                  >
                    ✏️
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── HEUTE: BEFINDEN ── */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '0.5px solid rgba(60,60,67,0.1)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: '#1C1C1E' }}>🩺 Befinden heute</h3>
            <Link
              href="/health/new"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#D97706',
                background: 'rgba(217,119,6,0.08)',
                padding: '5px 12px',
                borderRadius: 999,
                letterSpacing: '-0.01em',
              }}
            >
              + Eintrag
            </Link>
          </div>

          {healthLogs.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p style={{ fontSize: 14, color: 'rgba(60,60,67,0.4)' }}>Noch kein Befinden eingetragen</p>
              <Link href="/health/new" style={{ display: 'inline-block', marginTop: 6, fontSize: 14, color: '#D97706', fontWeight: 600 }}>
                Jetzt eintragen →
              </Link>
            </div>
          ) : (
            <div>
              {healthLogs.map((h, i) => (
                <div
                  key={h.id}
                  className="flex items-center px-4 py-3 gap-3"
                  style={i > 0 ? { borderTop: '0.5px solid rgba(60,60,67,0.07)' } : {}}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStoolColor(h.stool_consistency)}`}>
                        {getStoolLabel(h.stool_consistency)}
                      </span>
                      {h.vomiting && <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>⚠ Erbrochen</span>}
                      {h.fur_issue && <span style={{ fontSize: 12, color: '#EA580C', fontWeight: 600 }}>⚠ Fell</span>}
                    </div>
                    <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)', marginTop: 3 }}>
                      Appetit: {getAppetiteLabel(h.appetite)} · {getActivityLabel(h.activity)} · {formatTime(h.logged_at)}
                    </p>
                    {h.notes && <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', fontStyle: 'italic', marginTop: 2 }} className="truncate">{h.notes}</p>}
                  </div>
                  <Link
                    href={`/health/${h.id}/edit`}
                    className="flex-shrink-0 flex items-center justify-center transition-colors"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: 'rgba(120,120,128,0.08)',
                      fontSize: 14,
                    }}
                  >
                    ✏️
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── FÜTTERUNGS-STATISTIK ── */}
        {foodFrequency.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3.5" style={{ borderBottom: '0.5px solid rgba(60,60,67,0.1)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: '#1C1C1E' }}>Futter-Übersicht</h3>
              <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', marginTop: 2 }}>Letzte 30 Tage · Häufigkeit und Aktualität</p>
            </div>
            <div className="divide-y divide-gray-50">
              {foodFrequency.map((f) => {
                const info = getFoodInfo(f.brand, f.type)
                const maxCount = Math.max(...foodFrequency.map(x => x.count))
                const barWidth = Math.round((f.count / maxCount) * 100)
                const daysSince = Math.floor((today.getTime() - f.lastDate.getTime()) / (1000 * 60 * 60 * 24))
                return (
                  <div key={`${f.brand}||${f.type}`} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-medium text-gray-800 truncate">{f.type || f.brand}</span>
                        {info && (
                          <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full flex-shrink-0 ${getProteinBadgeColor(info)}`}>
                            {info.proteinType === 'mono' ? 'Mono' : 'Multi'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 text-right">
                        <span className="text-xs font-bold text-gray-700">{f.count}×</span>
                        <span className="text-[10px] text-gray-400">
                          {daysSince === 0 ? 'heute' : daysSince === 1 ? 'gestern' : `vor ${daysSince}d`}
                        </span>
                      </div>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── FUTTER-KORRELATION ── */}
        {foodCorrelation.length >= 2 && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3.5" style={{ borderBottom: '0.5px solid rgba(60,60,67,0.1)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: '#1C1C1E' }}>📊 Futter & Durchfall</h3>
              <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', marginTop: 2 }}>Wie oft trat Durchfall am selben oder nächsten Tag auf?</p>
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

        {/* ── GEWICHT ── */}
        <WeightWidget />

        {/* ── MEDIKAMENTE ── */}
        <MedicationsWidget />

        {/* ── PUSH-BENACHRICHTIGUNG ── */}
        <PushNotification />

        {/* ── ERINNERUNG – VOR EINEM JAHR ── */}
        <MemoryOfTheDay />

        {/* ── KI-AUSWERTUNG ── */}
        <AiInsights feedings={aiFeedings} health={aiHealth} pantry={aiPantry} />


      </main>
    </div>
  )
}

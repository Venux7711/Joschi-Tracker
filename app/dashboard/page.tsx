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
import type { Cat, FeedingLog, HealthLog, PantryItem, StoolConsistency } from '@/lib/types'
import AiInsights from '@/components/AiInsights'
import CatPhoto from '@/components/CatPhoto'
import MemoryOfTheDay from '@/components/MemoryOfTheDay'
import PushNotification from '@/components/PushNotification'
import WeightWidget from '@/components/WeightWidget'
import MedicationsWidget from '@/components/MedicationsWidget'
import { ANIFIT_FOODS, getFoodInfo, getProteinLabel, getProteinBadgeColor } from '@/lib/food-data'
import { getActiveCat, getCats } from '@/lib/active-cat.server'
import { getCatTheme } from '@/lib/cat-theme'

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

  // Aktive Katze (per Umschalter gewählt) holen, oder Joschi als allererste Katze anlegen
  let cat: Cat | undefined = await getActiveCat(supabase)
  if (!cat) {
    const { data: newCat } = await supabase.from('cats').insert({
      name: 'Joschi', owner_id: user.id, theme: 'amber', photo_url: '/joschi.jpg',
      breed: 'Britisch Langhaar', coat: 'golden', condition: 'Rezidivierender Durchfall',
      description_accusative: 'einen goldenen Britisch-Langhaar-Kater (British Longhair)',
      breed_label: 'Britisch Langhaar (golden)',
    }).select().single()
    cat = newCat as Cat | undefined
  }
  if (!cat) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Fehler beim Laden. Seite neu laden.</p>
    </div>
  )
  const theme = getCatTheme(cat.theme)

  // Vorrat ist Haushalts-, nicht Katzen-spezifisch – über alle Katzen des Besitzers
  const allCats = await getCats(supabase)
  const allCatIds = allCats.map((c) => c.id)

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
    // Fütterung ist Haushalts-Sache (zusammen gefüttert) → über alle Katzen
    supabase.from('feeding_logs').select('*').in('cat_id', allCatIds)
      .gte('logged_at', todayStart.toISOString()).lte('logged_at', todayEnd.toISOString())
      .order('logged_at', { ascending: true }),
    // Befinden ist individuell → nur die aktive Katze
    supabase.from('health_logs').select('*').eq('cat_id', cat.id)
      .gte('logged_at', todayStart.toISOString()).lte('logged_at', todayEnd.toISOString())
      .order('logged_at', { ascending: false }),
    supabase.from('health_logs').select('*')
      .eq('cat_id', cat.id).gte('logged_at', thirtyDaysAgo.toISOString())
      .order('logged_at', { ascending: false }),
    supabase.from('feeding_logs').select('*')
      .in('cat_id', allCatIds).gte('logged_at', thirtyDaysAgo.toISOString())
      .order('logged_at', { ascending: true }),
    supabase.from('pantry_items').select('*').in('cat_id', allCatIds).gt('quantity', 0),
  ])

  const feedings = (todayFeedingsRaw ?? []) as FeedingLog[]
  const healthLogs = (todayHealthRaw ?? []) as HealthLog[]

  // Mahlzeiten = unterschiedliche Futtersorten heute (gleiches Futter mehrfach = 1×)
  const distinctMealsToday = new Set(
    feedings.map(f => `${f.food_brand}||${f.food_type}`)
  ).size
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
  // Empfindlicher Bauch: aktuell Durchfall/weicher Stuhl → JETZT nichts Neues
  // ausprobieren, sondern auf Bewährtes/Mono setzen (deckt sich mit der KI-Analyse)
  const digestiveSensitive = recentDiarrhea || softOrDiarrhea7

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

    // Protein-Rotation (Neuheit) NUR belohnen, wenn der Bauch stabil ist.
    // Bei Durchfall/weichem Stuhl ist Abwechslung riskant → keine Neuheits-Boni.
    const newProteins = proteins.filter(p => !recentProteins7.has(p))
    const newFamilies = families.filter(f => !recentFamilies3.has(f))
    if (!digestiveSensitive) {
      if (proteins.length > 0 && newProteins.length === proteins.length) {
        score += 12
        reasons.push(`Frische Proteinquelle: ${proteins.join(' + ')}`)
      } else if (newProteins.length > 0) {
        score += 6
        reasons.push(`Teilweise neue Proteine: ${newProteins.join(', ')}`)
      }
      if (newFamilies.length > 0) {
        score += 5
        reasons.push(`Andere Proteinfamilie: ${newFamilies.join('/')}`)
      }
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

    // Verträglichkeits-Historie – bewährte Sorten zählen bei empfindlichem Bauch doppelt
    if (diarrheaRate !== null && corr) {
      if (diarrheaRate === 0 && corr.total >= 3) {
        score += digestiveSensitive ? 16 : 8
        reasons.push(`Sehr gute Verträglichkeit (${corr.total}× gegeben, 0% Durchfall)`)
      } else if (diarrheaRate === 0 && corr.total >= 1) {
        score += digestiveSensitive ? 8 : 3
        reasons.push(`Bisher verträglich (${corr.total}× gegeben)`)
      } else if (diarrheaRate > 0.6) {
        score -= 12
        warnings.push(`Schlechte Verträglichkeit: ${Math.round(diarrheaRate * 100)}% Durchfall-Rate`)
      } else if (diarrheaRate > 0.3) {
        score -= 5
        warnings.push(`Mäßige Verträglichkeit: ${Math.round(diarrheaRate * 100)}% Durchfall-Rate`)
      }
    } else if (digestiveSensitive) {
      // Empfindlicher Bauch → neue, unerprobte Sorte ist jetzt keine gute Idee
      score -= 8
      warnings.push('Unerprobte Sorte – bei empfindlichem Bauch lieber Bewährtes')
    } else {
      // Bauch stabil → neue Sorte liefert wertvolle Daten
      score += 3
      reasons.push('Noch nicht getestet → wertvoller Datenpunkt')
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

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── HERO ── */}
        <div
          className="rounded-3xl relative overflow-hidden"
          style={{
            background: theme.heroGradient,
            boxShadow: '0 8px 36px rgba(0,0,0,0.22)',
            padding: '20px 20px 20px 20px',
          }}
        >
          {/* glow */}
          <div className="absolute" style={{ inset: 0, backgroundImage: theme.heroGlow, pointerEvents: 'none' }} />

          {/* dezenter Lichtreflex bei glänzenden Themes (z.B. Bellas Silver Tabby) */}
          {theme.hasSheen && (
            <div className="absolute" style={{ inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: '-60%', bottom: '-60%', left: '58%', width: '26%',
                background: 'linear-gradient(75deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
              }} />
            </div>
          )}

          <div className="flex items-center gap-4 relative">
            {/* Photo with themed ring – kein overflow:hidden hier, sonst wird das Kamera-Badge abgeschnitten */}
            <div style={{ flexShrink: 0, padding: 3, borderRadius: '50%', background: theme.photoGradient }}>
              <CatPhoto src={cat.photo_url} name={cat.name} theme={cat.theme} size={72} editable catId={cat.id} />
            </div>

            <div className="flex-1 min-w-0">
              <p style={{ color: theme.heroAccentSoft, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                {greeting} 🐾
              </p>
              <h1 style={{ color: 'white', fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {cat.name}
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginTop: 4, letterSpacing: '-0.01em' }}>
                {today.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>

            <div className="text-right flex-shrink-0 relative">
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>
                Mahlzeiten
              </div>
              <div style={{ color: distinctMealsToday > 0 ? theme.heroAccent : 'rgba(255,255,255,0.3)', fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {distinctMealsToday}
              </div>
              {streak > 0 && (
                <div style={{ color: streak >= 7 ? theme.heroAccentBright : 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 4, fontWeight: 500 }}>
                  {streak >= 7 ? `🌟 ${streak}d` : `${streak}d gut`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── QUICK ACTIONS ── */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/feeding/new"
            className="pressable rounded-2xl flex items-center gap-3.5"
            style={{
              padding: '18px 20px',
              background: 'linear-gradient(145deg, var(--am-400) 0%, var(--am-600) 100%)',
              boxShadow: '0 4px 20px rgba(var(--am-600-rgb), 0.28), 0 1px 4px rgba(var(--am-600-rgb), 0.15)',
            }}
          >
            <span style={{ fontSize: 26, lineHeight: 1 }}>🍽️</span>
            <div>
              <div style={{ color: 'white', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>Futter</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 3, fontWeight: 500 }}>für {cat.name} erfassen</div>
            </div>
          </Link>
          <Link
            href="/health/new"
            className="card pressable rounded-2xl flex items-center gap-3.5"
            style={{ padding: '18px 20px' }}
          >
            <span style={{ fontSize: 26, lineHeight: 1 }}>🩺</span>
            <div>
              <div style={{ color: '#1C1C1E', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>Befinden</div>
              <div style={{ color: 'rgba(60,60,67,0.4)', fontSize: 11, marginTop: 3, fontWeight: 500 }}>wie geht es {cat.name}?</div>
            </div>
          </Link>
        </div>

        {/* ── CHAT MIT DER KI ── */}
        <Link
          href="/chat"
          className="pressable rounded-2xl flex items-center gap-3.5"
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(145deg, #A78BFA 0%, #7C3AED 100%)',
            boxShadow: '0 4px 20px rgba(124,58,237,0.26), 0 1px 4px rgba(124,58,237,0.15)',
          }}
        >
          <span style={{ fontSize: 24, lineHeight: 1 }}>💬</span>
          <div className="flex-1 min-w-0">
            <div style={{ color: 'white', fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>Chat mit der KI</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3, fontWeight: 500 }}>Fragen stellen & ihr beibringen, was sie wissen soll</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2.5} style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {/* ── FUTTER-EMPFEHLUNG ── */}
        {bestRec && (
          <div className="card overflow-hidden">
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Empfehlung</h3>
            </div>

            {/* Beste Empfehlung */}
            <div className="px-5 pt-4 pb-3">
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
              <div className="px-5 pb-4 pt-3" style={{ borderTop: '0.5px solid rgba(60,60,67,0.07)' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(60,60,67,0.4)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Alternativen
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {topRecs.slice(1).map((rec, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span style={{ fontSize: 13, color: '#3C3C43', letterSpacing: '-0.01em' }} className="truncate">
                        {rec.type}
                      </span>
                      {rec.inPantry && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--am-600)', background: 'rgba(var(--am-600-rgb), 0.08)', padding: '2px 7px', borderRadius: 999, flexShrink: 0 }}>
                          Vorrat
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STATS KARTEN ── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Streak */}
          <div className="card" style={{ padding: '20px 20px 18px' }}>
            <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, color: streak >= 3 ? '#16A34A' : streak > 0 ? 'var(--am-600)' : '#DC2626' }}>
              {streak}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(60,60,67,0.55)', marginTop: 6, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
              Tage kein<br />Durchfall
            </div>
          </div>

          {/* 30-Tage Durchfall */}
          <div className="card" style={{ padding: '20px 20px 18px' }}>
            <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, color: diarrhea30Days === 0 ? '#16A34A' : diarrhea30Days <= 5 ? 'var(--am-600)' : '#DC2626' }}>
              {diarrhea30Days}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(60,60,67,0.55)', marginTop: 6, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
              Durchfall-Tage<br />letzte 30 Tage
            </div>
          </div>

          {/* Aktueller Stuhl */}
          <div className="card" style={{ padding: '20px 20px 18px' }}>
            {latestStool ? (
              <>
                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${getStoolColor(latestStool)}`}>
                  {getStoolLabel(latestStool)}
                </span>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(60,60,67,0.55)', marginTop: 10, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                  Letzter Stuhlgang<br />
                  {new Date(health30[0]?.logged_at ?? '').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 36, fontWeight: 700, color: 'rgba(60,60,67,0.15)', lineHeight: 1 }}>–</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(60,60,67,0.55)', marginTop: 6, lineHeight: 1.3 }}>
                  Stuhlgang<br />noch nichts heute
                </div>
              </>
            )}
          </div>

          {/* Erbrechen 7 Tage */}
          <div className="card" style={{ padding: '20px 20px 18px' }}>
            <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, color: vomiting7Days === 0 ? '#16A34A' : '#DC2626' }}>
              {vomiting7Days}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(60,60,67,0.55)', marginTop: 6, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
              Mal erbrochen<br />letzte 7 Tage
            </div>
          </div>
        </div>

        {/* ── STUHLGANG TREND ── */}
        <div className="card" style={{ padding: '20px 20px 18px' }}>
          {/* Header + dynamic summary */}
          <div className="flex items-start justify-between" style={{ marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Stuhlgang</h3>
              <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 2 }}>letzte 14 Tage</p>
            </div>
            {(() => {
              const dDays = trend14.filter(d => d.stool === 'diarrhea').length
              const nDays = trend14.filter(d => d.stool === 'normal').length
              if (dDays === 0) return (
                <span style={{ fontSize: 12, fontWeight: 600, color: '#16A34A', background: 'rgba(22,163,74,0.09)', padding: '5px 11px', borderRadius: 999 }}>
                  {nDays}× normal ✓
                </span>
              )
              return (
                <span style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', background: 'rgba(220,38,38,0.08)', padding: '5px 11px', borderRadius: 999 }}>
                  {dDays}× Durchfall
                </span>
              )
            })()}
          </div>

          {/* Dot timeline */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {trend14.map(({ day, stool }, i) => {
              const bg = stool === 'normal' ? '#4ADE80'
                : stool === 'soft' ? 'var(--am-300)'
                : stool === 'diarrhea' ? '#F87171'
                : undefined
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: '100%',
                    aspectRatio: '1',
                    minWidth: 12,
                    borderRadius: 5,
                    background: bg ?? 'rgba(120,120,128,0.1)',
                    border: !bg ? '1.5px dashed rgba(120,120,128,0.22)' : 'none',
                  }} />
                  <span style={{ fontSize: 9, color: 'rgba(60,60,67,0.35)', lineHeight: 1, letterSpacing: '0.01em' }}>
                    {i % 2 === 0 ? dayLabel(day) : ''}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Inline legend */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4, borderTop: '0.5px solid rgba(60,60,67,0.07)' }}>
            {([
              { color: '#4ADE80', label: 'Normal' },
              { color: 'var(--am-300)', label: 'Weich' },
              { color: '#F87171', label: 'Durchfall = rot' },
              { border: true, label: 'Kein Eintrag' },
            ] as { color?: string; border?: boolean; label: string }[]).map(({ color, border, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 9, height: 9, borderRadius: 3, flexShrink: 0,
                  background: color ?? 'rgba(120,120,128,0.1)',
                  border: border ? '1.5px dashed rgba(120,120,128,0.3)' : 'none',
                }} />
                <span style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── HEUTE: FUTTER ── */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Futter heute</h3>
            <Link
              href="/feeding/new"
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--am-600)', background: 'rgba(var(--am-600-rgb), 0.08)', padding: '6px 14px', borderRadius: 999 }}
            >
              + Eintrag
            </Link>
          </div>

          {feedings.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 22, marginBottom: 8 }}>🐾</p>
              <p style={{ fontSize: 14, color: 'rgba(60,60,67,0.4)', fontWeight: 500 }}>{cat.name} wartet auf sein Futter</p>
              <Link href="/feeding/new" style={{ display: 'inline-block', marginTop: 10, fontSize: 14, color: 'var(--am-600)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Jetzt füttern →
              </Link>
            </div>
          ) : (
            <div>
              {feedings.map((f, i) => (
                <Link
                  key={f.id}
                  href={`/feeding/${f.id}/edit`}
                  className="list-row flex items-center gap-3"
                  style={{ padding: '14px 20px', textDecoration: 'none', display: 'flex', ...(i > 0 ? { borderTop: '0.5px solid rgba(60,60,67,0.07)' } : {}) }}
                >
                  <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: 'rgba(var(--am-400-rgb), 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
                    🍽️
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1C1E', letterSpacing: '-0.015em' }} className="truncate">
                      {f.food_type || f.food_brand}
                    </p>
                    <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 2 }} className="truncate">
                      {f.food_brand}{f.amount_grams ? ` · ${f.amount_grams}g` : ''} · {formatTime(f.logged_at)}
                    </p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(60,60,67,0.2)" strokeWidth={2.5} style={{ flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── HEUTE: BEFINDEN ── */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Befinden heute</h3>
            <Link
              href="/health/new"
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--am-600)', background: 'rgba(var(--am-600-rgb), 0.08)', padding: '6px 14px', borderRadius: 999 }}
            >
              + Eintrag
            </Link>
          </div>

          {healthLogs.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: 'rgba(60,60,67,0.4)', fontWeight: 500 }}>Noch kein Befinden für heute</p>
              <Link href="/health/new" style={{ display: 'inline-block', marginTop: 10, fontSize: 14, color: 'var(--am-600)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Wie geht es {cat.name}? →
              </Link>
            </div>
          ) : (
            <div>
              {healthLogs.map((h, i) => (
                <Link
                  key={h.id}
                  href={`/health/${h.id}/edit`}
                  className="list-row flex items-center gap-3"
                  style={{ padding: '14px 20px', textDecoration: 'none', display: 'flex', ...(i > 0 ? { borderTop: '0.5px solid rgba(60,60,67,0.07)' } : {}) }}
                >
                  <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: 'rgba(120,120,128,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
                    🩺
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStoolColor(h.stool_consistency)}`}>
                        {getStoolLabel(h.stool_consistency)}
                      </span>
                      {h.vomiting && <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>Erbrochen</span>}
                      {h.fur_issue && <span style={{ fontSize: 12, color: '#EA580C', fontWeight: 600 }}>Fell</span>}
                    </div>
                    <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 4 }}>
                      {getAppetiteLabel(h.appetite)} · {getActivityLabel(h.activity)} · {formatTime(h.logged_at)}
                    </p>
                    {h.notes && <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.35)', fontStyle: 'italic', marginTop: 2 }} className="truncate">{h.notes}</p>}
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(60,60,67,0.2)" strokeWidth={2.5} style={{ flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── FÜTTERUNGS-STATISTIK ── */}
        {foodFrequency.length > 0 && (
          <div className="card overflow-hidden">
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Futter · 30 Tage</h3>
            </div>
            <div>
              {foodFrequency.map((f, i) => {
                const info = getFoodInfo(f.brand, f.type)
                const maxCount = Math.max(...foodFrequency.map(x => x.count))
                const barWidth = Math.round((f.count / maxCount) * 100)
                const daysSince = Math.floor((today.getTime() - f.lastDate.getTime()) / (1000 * 60 * 60 * 24))
                return (
                  <div
                    key={`${f.brand}||${f.type}`}
                    style={{ padding: '12px 20px 14px', ...(i > 0 ? { borderTop: '0.5px solid rgba(60,60,67,0.07)' } : {}) }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#1C1C1E', letterSpacing: '-0.01em' }} className="truncate">
                          {f.type || f.brand}
                        </span>
                        {info && (
                          <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full flex-shrink-0 ${getProteinBadgeColor(info)}`}>
                            {info.proteinType === 'mono' ? 'Mono' : 'Multi'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1C1E' }}>{f.count}×</span>
                        <span style={{ fontSize: 11, color: 'rgba(60,60,67,0.35)' }}>
                          {daysSince === 0 ? 'heute' : daysSince === 1 ? 'gestern' : `vor ${daysSince}d`}
                        </span>
                      </div>
                    </div>
                    <div style={{ height: 3, background: 'rgba(120,120,128,0.1)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--am-400)', borderRadius: 999, width: `${barWidth}%` }} />
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
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Futter & Durchfall</h3>
            </div>
            <div style={{ padding: '4px 20px 16px' }}>
              {foodCorrelation.map((s, i) => {
                const pct = Math.round((s.diarrhea / s.total) * 100)
                const barBg = pct >= 60 ? '#F87171' : pct >= 30 ? 'var(--am-300)' : '#4ADE80'
                const pctColor = pct >= 60 ? '#DC2626' : pct >= 30 ? 'var(--am-600)' : '#16A34A'
                return (
                  <div key={`${s.brand}||${s.type}`} style={{ paddingTop: i === 0 ? 12 : 14, paddingBottom: 4 }}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#1C1C1E', letterSpacing: '-0.01em' }} className="truncate min-w-0">
                        {s.type || s.brand}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: pctColor, flexShrink: 0 }}>
                        {pct}%
                      </span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(120,120,128,0.1)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: barBg, borderRadius: 999, width: `${pct}%`, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
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
        <AiInsights
          feedings={aiFeedings}
          health={aiHealth}
          pantry={aiPantry}
          cat={{
            name: cat.name,
            breed: cat.breed ?? '',
            descriptionAccusative: cat.description_accusative ?? cat.name,
            condition: cat.condition ?? '',
          }}
        />


      </main>
    </div>
  )
}

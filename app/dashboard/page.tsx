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
  dedupeSharedFeedings,
  dedupeFeedingsPerDay,
} from '@/lib/utils'
import {
  addBerlinDays,
  berlinDayEnd,
  berlinDayStart,
  berlinDaysBetween,
  formatBerlin,
  formatBerlinDate,
  berlinHour,
  berlinDateKey,
  fromBerlinInputValue,
  isIsoDay,
  pastBerlinDays,
} from '@/lib/time'
import type { Cat, FeedingLog, HealthLog, PantryItem, StoolConsistency } from '@/lib/types'
import AiInsights from '@/components/AiInsights'
import CatPhoto from '@/components/CatPhoto'
import MemoryOfTheDay from '@/components/MemoryOfTheDay'
import QuickFeed from '@/components/QuickFeed'
import BirthdayCard from '@/components/BirthdayCard'
import QuickHealth from '@/components/QuickHealth'
import { birthdayInfo } from '@/lib/birthday'
import { hasStill, stillUrl } from '@/lib/media'
import WeightWidget from '@/components/WeightWidget'
import MedicationsWidget from '@/components/MedicationsWidget'
import { ANIFIT_FOODS, getFoodInfo, getProteinLabel, getProteinBadgeColor } from '@/lib/food-data'
import { getActiveCat, getCats } from '@/lib/active-cat.server'
import { getCatTheme } from '@/lib/cat-theme'

function dayLabel(date: Date): string {
  return formatBerlin(date, { weekday: 'short' }).slice(0, 2)
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

// Zeitraum für die beiden Futter-Statistiken. Die Gesundheits-Kacheln bleiben
// fest bei 30/14/7 Tagen – die sind so beschriftet und sollen vergleichbar
// bleiben. Auch die Empfehlung rechnet unverändert auf 30 Tagen, damit sie sich
// nicht ändert, nur weil man eine Anzeige umschaltet.
const FOOD_RANGES = [
  { key: '30', label: '30 Tage', days: 30 },
  { key: '90', label: '90 Tage', days: 90 },
  { key: '365', label: '1 Jahr', days: 365 },
  { key: 'alle', label: 'Alles', days: null },
] as const

const DEFAULT_FOOD_RANGE = FOOD_RANGES[0]

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { futter?: string }
}) {
  const foodRange = FOOD_RANGES.find(r => r.key === searchParams?.futter) ?? DEFAULT_FOOD_RANGE
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
  // Fütterung gilt immer für den ganzen Haushalt → Beschriftung entsprechend
  const householdNames = allCats.map((c) => c.name).join(' & ')
  const multiCat = allCats.length > 1

  // Datumsrahmen – alle Tagesgrenzen in Berliner Zeit, nicht in Serverzeit (UTC)
  const now = new Date()
  const todayStart = berlinDayStart(now)
  const todayEnd = berlinDayEnd(now)
  const thirtyDaysAgo = addBerlinDays(now, -29)
  const sevenDaysAgo = addBerlinDays(now, -6)
  const threeDaysAgo = addBerlinDays(now, -2)
  // Fenster für die Futter-Statistiken: mindestens die 30 Tage, die Empfehlung
  // und Gesundheits-Kacheln ohnehin brauchen – bei "Alles" ohne Untergrenze
  const rangeStart = foodRange.days === null ? null : addBerlinDays(now, -(foodRange.days - 1))
  // Verträglichkeit über ein halbes Jahr statt 30 Tage: Ein Futter, das
  // wiederholt Beschwerden gemacht hat, soll nicht als bewährt gelten, nur
  // weil die Vorfälle aus dem Anzeige-Fenster gerutscht sind.
  const toleranceStart = addBerlinDays(now, -180)

  const [
    { data: todayFeedingsRaw },
    { data: todayHealthRaw },
    { data: allHealthRange },
    { data: allFeedingsRange },
    { data: pantryRaw },
    { data: toleranceFeedRaw },
    { data: toleranceHealthRaw },
    { data: absenceRaw },
  ] = await Promise.all([
    // Fütterung ist Haushalts-Sache (zusammen gefüttert) → über alle Katzen
    supabase.from('feeding_logs').select('*').in('cat_id', allCatIds)
      .gte('logged_at', todayStart.toISOString()).lte('logged_at', todayEnd.toISOString())
      .order('logged_at', { ascending: true }),
    // Befinden ist individuell → nur die aktive Katze
    supabase.from('health_logs').select('*').eq('cat_id', cat.id)
      .gte('logged_at', todayStart.toISOString()).lte('logged_at', todayEnd.toISOString())
      .order('logged_at', { ascending: false }),
    // Über ALLE Katzen: die Futterempfehlung ist eine Haushalts-Entscheidung
    // (gefüttert wird gemeinsam) – Statistiken filtern unten wieder auf die
    // aktive Katze bzw. auf die festen 30 Tage
    (rangeStart
      ? supabase.from('health_logs').select('*').in('cat_id', allCatIds).gte('logged_at', rangeStart.toISOString())
      : supabase.from('health_logs').select('*').in('cat_id', allCatIds)
    ).order('logged_at', { ascending: false }),
    (rangeStart
      ? supabase.from('feeding_logs').select('*').in('cat_id', allCatIds).gte('logged_at', rangeStart.toISOString())
      : supabase.from('feeding_logs').select('*').in('cat_id', allCatIds)
    ).order('logged_at', { ascending: true }),
    supabase.from('pantry_items').select('*').in('cat_id', allCatIds).gt('quantity', 0),
    // Eigene, längere Basis für die Verträglichkeit (siehe unten)
    supabase.from('feeding_logs').select('*').in('cat_id', allCatIds)
      .gte('logged_at', toleranceStart.toISOString()).order('logged_at', { ascending: true }),
    supabase.from('health_logs').select('*').in('cat_id', allCatIds)
      .gte('logged_at', toleranceStart.toISOString()).order('logged_at', { ascending: false }),
    // Betreuungszeitraum, der heute läuft oder als nächstes ansteht
    supabase.from('absences').select('*').gte('ends_on', berlinDateKey(now)).order('starts_on').limit(1),
  ])

  // Geteilte Mahlzeiten (eine Zeile pro Katze) nur einmal anzeigen/zählen
  const feedings = dedupeSharedFeedings((todayFeedingsRaw ?? []) as FeedingLog[])
  const healthLogs = (todayHealthRaw ?? []) as HealthLog[]

  // Mahlzeiten = unterschiedliche Futtersorten heute (gleiches Futter mehrfach = 1×)
  const distinctMealsToday = new Set(
    feedings.map(f => `${f.food_brand}||${f.food_type}`)
  ).size
  // Der gewählte Zeitraum (mindestens 30 Tage) – speist die beiden Futter-Karten
  const healthRangeHousehold = (allHealthRange ?? []) as HealthLog[]
  const feedingsRange = dedupeSharedFeedings((allFeedingsRange ?? []) as FeedingLog[])
  // Für Häufigkeits-/Verträglichkeits-Statistiken zählt eine Sorte pro Tag einmal:
  // 3× dieselbe Dose an einem Tag ist ein Tag mit dieser Sorte, nicht drei.
  const feedingDaysRange = dedupeFeedingsPerDay(feedingsRange)

  // Die festen 30 Tage als Teilmenge – für Gesundheits-Kacheln und Empfehlung,
  // die sich durch den Anzeige-Filter nicht verändern dürfen
  const inLast30 = (iso: string) => new Date(iso) >= thirtyDaysAgo
  const health30Household = healthRangeHousehold.filter(h => inLast30(h.logged_at))
  const health30 = health30Household.filter(h => h.cat_id === cat.id)
  const feedings30 = feedingsRange.filter(f => inLast30(f.logged_at))
  const feedingDays30 = feedingDaysRange.filter(f => inLast30(f.logged_at))
  const pantry = (pantryRaw ?? []) as PantryItem[]

  // Basis der Verträglichkeits-Bewertung, unabhängig vom Anzeige-Zeitraum
  const healthTolerance = (toleranceHealthRaw ?? []) as HealthLog[]
  const feedingDaysTolerance = dedupeFeedingsPerDay(
    dedupeSharedFeedings((toleranceFeedRaw ?? []) as FeedingLog[]),
  )

  // === Statistiken berechnen ===

  const past30 = pastBerlinDays(30, now)
  const past14 = pastBerlinDays(14, now)

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

  // Wann war der letzte Durchfall? Bewusst ohne Zeitgrenze abgefragt – liegt er
  // länger als 30 Tage zurück, ist genau das die interessante Auskunft.
  const { data: lastDiarrheaRow } = await supabase
    .from('health_logs')
    .select('logged_at')
    .eq('cat_id', cat.id)
    .eq('stool_consistency', 'diarrhea')
    .order('logged_at', { ascending: false })
    .limit(1)
  const lastDiarrhea = lastDiarrheaRow?.[0]?.logged_at as string | undefined
  const daysSinceDiarrhea = lastDiarrhea ? berlinDaysBetween(lastDiarrhea, now) : null

  // Durchfall-Tage innerhalb der 14-Tage-Kurve, für die Beschriftung darunter
  const diarrheaDatesIn14 = trend14
    .filter(d => d.stool === 'diarrhea')
    .map(d => formatBerlin(d.day, { day: 'numeric', month: 'short' }))

  // Erbrech-Tage in letzten 7 Tagen
  const past7 = pastBerlinDays(7, now)
  const vomiting7Days = past7.filter(day =>
    health30.some(h => isSameDay(new Date(h.logged_at), day) && h.vomiting)
  ).length

  // === Futter-Verträglichkeit ===
  //
  // Bewertet wird nicht nur Durchfall. Weicher Stuhl und Kot im Fell sind
  // ebenfalls Warnzeichen – bei einer Langhaarkatze mit empfindlichem Darm
  // sogar die häufigeren. Vorher zählte allein Durchfall, wodurch eine Sorte
  // mit 3× weichem Stuhl und 5× Kot im Fell als "sehr gut verträglich" galt.
  //
  // Bezugsgröße sind ALLE Fütterungstage. Im Haushalt wird das Befinden nur
  // erfasst, wenn etwas auffällig ist – ein Tag ohne Eintrag heißt also
  // "alles in Ordnung", nicht "nicht beobachtet". Rechnet man nur über Tage
  // mit Eintrag, überzeichnet das Problemsorten massiv: Bio Enten-Energie
  // käme auf 90 % statt auf die tatsächlichen 35 %.
  type FoodStat = {
    brand: string; type: string
    total: number      // Fütterungstage insgesamt
    rated: number      // davon mit Befinden am selben oder Folgetag
    diarrhea: number
    soft: number
    fur: number
  }

  const buildFoodMap = (feedingDays: FeedingLog[], health: HealthLog[]) => {
    const map = new Map<string, FoodStat>()
    for (const f of feedingDays) {
      const key = `${f.food_brand}||${f.food_type}`
      const fDay = new Date(f.logged_at)
      const nextDay = addBerlinDays(fDay, 1)

      // Haushaltsweit: Beschwerden bei irgendeiner Katze nach diesem Futter zählen
      const window = health.filter(h => {
        const hDay = new Date(h.logged_at)
        return isSameDay(hDay, fDay) || isSameDay(hDay, nextDay)
      })

      if (!map.has(key)) {
        map.set(key, { brand: f.food_brand, type: f.food_type, total: 0, rated: 0, diarrhea: 0, soft: 0, fur: 0 })
      }
      const stat = map.get(key)!
      stat.total++
      if (window.length === 0) continue

      stat.rated++
      if (window.some(h => h.stool_consistency === 'diarrhea')) stat.diarrhea++
      if (window.some(h => h.stool_consistency === 'soft')) stat.soft++
      if (window.some(h => h.fur_issue)) stat.fur++
    }
    return map
  }

  /**
   * Anteil auffälliger Tage, 0 bis 1. Durchfall wiegt am schwersten, weicher
   * Stuhl und Kot im Fell zählen anteilig mit – ignorieren wäre falsch, gleich
   * gewichten aber auch.
   */
  const troubleRate = (s: FoodStat): number | null => {
    if (s.total === 0) return null
    const score = s.diarrhea * 1 + s.soft * 0.6 + s.fur * 0.5
    return Math.min(1, score / s.total)
  }

  /**
   * Betreuung: Die Katzen sind nicht zuhause, jemand anderes füttert.
   *
   * In dieser Zeit soll die Empfehlung nichts Neues vorschlagen und schlecht
   * vertragene Sorten deutlicher meiden. Wer sie betreut, kennt sie weniger
   * gut, und Durchfall an einem fremden Ort ist der unangenehmste Fall.
   */
  type Absence = { id: string; starts_on: string; ends_on: string; label: string | null }
  // Auf gültige Datumsfelder prüfen: Ein unvollständiger Datensatz soll das
  // ganze Dashboard nicht mit einer Server-Exception abschießen.
  const absenceCandidate = ((absenceRaw ?? []) as Absence[])[0] ?? null
  const absence =
    absenceCandidate && isIsoDay(absenceCandidate.starts_on) && isIsoDay(absenceCandidate.ends_on)
      ? absenceCandidate
      : null
  const heuteKey = berlinDateKey(now)
  const awayMode = !!absence && absence.starts_on <= heuteKey && absence.ends_on >= heuteKey

  /**
   * Was für diesen Zeitraum eingepackt wurde.
   *
   * Bewusst als eigene Abfrage nach dem Promise.all oben: Sie hängt von der
   * id des Zeitraums ab, den es erst danach gibt. Ins Promise.all gezwängt
   * hätte sie nur mit einer zweiten Runde funktioniert.
   */
  type Supply = { brand: string; type: string; quantity: number; size_grams: number | null }
  let proviant: Supply[] = []
  if (absence) {
    const { data: supplyRaw } = await supabase
      .from('absence_supplies')
      .select('brand, type, quantity, size_grams')
      .eq('absence_id', absence.id)
    proviant = (supplyRaw ?? []) as Supply[]
  }
  const absenceSoon = !!absence && !awayMode
  const absenceDaysLeft = absence
    ? berlinDaysBetween(now, fromBerlinInputValue(absence.ends_on))
    : 0

  // Wie viele Tage ist es her, dass es eine Sorte gab? Basis für die
  // Abwertung von kürzlich Gefüttertem.
  const lastFedDays = new Map<string, number>()
  for (const f of feedingDaysTolerance) {
    const key = `${f.food_brand}||${f.food_type}`
    const days = berlinDaysBetween(f.logged_at, now)
    const prev = lastFedDays.get(key)
    if (prev === undefined || days < prev) lastFedDays.set(key, days)
  }

  // Empfehlung: eigene, längere Basis. Verträglichkeit altert nicht binnen
  // 30 Tagen weg – sonst gilt eine Sorte als bewährt, nur weil ihre Vorfälle
  // aus dem Fenster gerutscht sind.
  const foodMap = buildFoodMap(feedingDaysTolerance, healthTolerance)
  // Karte: folgt dem gewählten Zeitraum
  // Karte: folgt dem gewählten Zeitraum, ab zwei Fütterungstagen
  const foodCorrelation = Array.from(buildFoodMap(feedingDaysRange, healthRangeHousehold).values())
    .filter(s => s.total >= 2)
    .sort((a, b) => (troubleRate(b) ?? 0) - (troubleRate(a) ?? 0))
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
  // Haushaltsweit: hat IRGENDEINE Katze gerade einen empfindlichen Bauch, gilt
  // das fürs gemeinsame Futter – die Empfehlung ist dadurch in beiden Tabs gleich
  const recentDiarrhea = health30Household.some(h =>
    new Date(h.logged_at) >= threeDaysAgo && h.stool_consistency === 'diarrhea'
  )
  const softOrDiarrhea7 = health30Household.some(h =>
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
  const vorratsSorten = pantry.map(p => ({ brand: p.brand, type: p.type, inPantry: true, quantity: p.quantity }))

  // Während der Betreuung zählt nur, was eingepackt ist. Eine Sorte
  // vorzuschlagen, die zuhause im Regal steht, hilft niemandem – wer füttert,
  // hat ausschließlich den Proviant zur Verfügung.
  //
  // Ist kein Proviant hinterlegt, bleibt der Vorrat die beste verfügbare
  // Annahme. Das Betreuungs-Feld weist dann darauf hin, dass die Angabe fehlt.
  const proviantSorten = proviant.map(s => ({
    brand: s.brand, type: s.type, inPantry: true, quantity: s.quantity,
  }))
  const nurProviant = awayMode && proviantSorten.length > 0
  const nurVorrat = awayMode && !nurProviant && vorratsSorten.length > 0

  const candidates: Array<{ brand: string; type: string; inPantry: boolean; quantity?: number }> =
    nurProviant
      ? proviantSorten
      : nurVorrat
        ? vorratsSorten
        : [
            ...vorratsSorten,
            ...ANIFIT_FOODS.filter(f => !pantryKeys.has(`${f.brand}||${f.type}`))
              .map(f => ({ brand: f.brand, type: f.type, inPantry: false })),
          ]

  // Bestand gleichmäßig aufbrauchen: Wer über dem Schnitt liegt, kommt zuerst
  // dran, knappe Sorten werden geschont. Sonst ist am Ende eine Sorte leer,
  // während von den anderen noch volle Stapel dastehen.
  //
  // Der Schnitt bezieht sich auf die Sorten, die gerade zur Auswahl stehen –
  // während der Betreuung also auf den Proviant. Der Vorrat zuhause darf dann
  // nicht mitrechnen, sonst gälten sechs eingepackte Dosen als "wenig".
  const bestand = candidates.filter(c => c.inPantry && c.quantity !== undefined)
  const avgCans = bestand.length > 0
    ? bestand.reduce((sum, c) => sum + (c.quantity ?? 0), 0) / bestand.length
    : 0

  const recommendations: FoodRecCandidate[] = candidates.map(c => {
    const info = getFoodInfo(c.brand, c.type)
    const proteins = info?.proteins ?? []
    const families = info?.proteinFamily ?? []
    const corrKey = `${c.brand}||${c.type}`
    const corr = foodMap.get(corrKey)
    const rate = corr ? troubleRate(corr) : null
    const givenToday = todayFoodKeys.has(corrKey)

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    // Vorrat bevorzugen
    if (c.inPantry) score += 15

    // …und innerhalb des Vorrats den größten Stapel zuerst, damit alle Sorten
    // ungefähr gleichzeitig leer werden. −1 (fast leer) bis +1 (deutlich über
    // dem Schnitt), auf ±10 Punkte skaliert – stark genug zum Ausgleichen,
    // schwach genug, dass Verträglichkeit und Rotation weiter den Ton angeben.
    if (c.inPantry && c.quantity !== undefined && avgCans > 0 && bestand.length > 1) {
      const relative = Math.max(-1, Math.min(1, (c.quantity - avgCans) / avgCans))
      score += Math.round(relative * 10)
      if (relative > 0.25) {
        reasons.push(`Größter Vorrat (${c.quantity} Dosen) – zuerst aufbrauchen`)
      } else if (relative < -0.25) {
        warnings.push(`Nur noch ${c.quantity} Dose${c.quantity !== 1 ? 'n' : ''} – für später aufheben`)
      }
    }

    // Protein-Rotation (Neuheit) NUR belohnen, wenn der Bauch stabil ist.
    // Bei Durchfall/weichem Stuhl ist Abwechslung riskant → keine Neuheits-Boni.
    const newProteins = proteins.filter(p => !recentProteins7.has(p))
    const newFamilies = families.filter(f => !recentFamilies3.has(f))
    // Bei empfindlichem Bauch UND während der Betreuung keine Neuheits-Boni:
    // Abwechslung ist dann ein Risiko, kein Vorteil.
    if (!digestiveSensitive && !awayMode) {
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

    // Verträglichkeit – bewährte Sorten zählen bei empfindlichem Bauch doppelt
    if (rate !== null && corr) {
      const pct = Math.round(rate * 100)
      const belege = `${corr.total} ${corr.total === 1 ? 'Fütterungstag' : 'Fütterungstagen'}`
      const details = [
        corr.diarrhea > 0 ? `${corr.diarrhea}× Durchfall` : null,
        corr.soft > 0 ? `${corr.soft}× weich` : null,
        corr.fur > 0 ? `${corr.fur}× Kot im Fell` : null,
      ].filter(Boolean).join(', ')

      if (rate === 0 && corr.total >= 3) {
        score += digestiveSensitive ? 16 : 8
        reasons.push(`Sehr gut vertragen (${belege}, ohne Auffälligkeit)`)
      } else if (rate === 0 && corr.total >= 1) {
        score += digestiveSensitive ? 8 : 3
        reasons.push(`Bisher unauffällig (${belege})`)
      } else if (rate > 0.5 && corr.total >= 3) {
        score -= 18
        warnings.push(`Schlecht vertragen: ${details} bei ${belege}`)
      } else if (rate > 0.25 && corr.total >= 3) {
        score -= 8
        warnings.push(`Mäßig vertragen: ${details} bei ${belege}`)
      } else if (details && corr.total < 3) {
        // Ein oder zwei auffällige Tage sind ein Hinweis, kein Urteil – sonst
        // verurteilt eine einzelne Beobachtung eine Sorte dauerhaft.
        score -= 4
        warnings.push(`Einzelbeobachtung: ${details} bei ${belege}`)
      } else if (details) {
        score -= 3
        warnings.push(`Vereinzelt auffällig: ${details} bei ${belege}`)
      }
      // Nur zur Einordnung, wenn es kaum Belege gibt
      if (rate === 0 && corr.total >= 3) {
        reasons.push(`An ${corr.total} Tagen gegeben, nie beanstandet`)
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

    // Betreuung: Bewährtes deutlich bevorzugen, Unerprobtes und Auffälliges
    // deutlich abwerten. Der Aufschlag kommt zur normalen Bewertung dazu.
    if (awayMode) {
      if (rate === null) {
        score -= 15
        warnings.push('Während der Betreuung nichts Unerprobtes')
      } else if (rate > 0.25) {
        score -= 10
        warnings.push('Während der Betreuung besser meiden')
      } else if (rate <= 0.1 && corr && corr.total >= 5) {
        score += 10
        reasons.push('Bewährt – gut für die Betreuungszeit')
      }
    }

    // Kürzlich gefüttert → abwerten. Vorher wurde nur "heute" bestraft, wodurch
    // eine Sorte, die es drei Tage am Stück gab, gleich wieder oben stand.
    const lastFed = lastFedDays.get(corrKey)
    if (lastFed !== undefined && !givenToday) {
      if (lastFed <= 1) { score -= 14; warnings.push(lastFed === 0 ? 'Gerade erst gegeben' : 'Gestern gegeben') }
      else if (lastFed <= 3) { score -= 8; warnings.push(`Vor ${lastFed} Tagen gegeben`) }
      else if (lastFed <= 6) { score -= 3 }
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
    date: formatBerlinDate(f.logged_at),
    brand: f.food_brand,
    type: f.food_type,
    grams: f.amount_grams ?? undefined,
    treat: (f as FeedingLog & { treat_amount?: number }).treat_amount ?? undefined,
    dry: (f as FeedingLog & { dry_food_amount?: number }).dry_food_amount ?? undefined,
    extras: (f as FeedingLog & { extras?: string }).extras ?? undefined,
  }))

  const aiHealth = health30.map(h => ({
    date: formatBerlinDate(h.logged_at),
    stool: h.stool_consistency,
    appetite: h.appetite,
    activity: h.activity,
    vomiting: h.vomiting,
    furIssue: h.fur_issue,
    notes: h.notes ?? undefined,
  }))

  // === Tatsächlicher Verbrauch ===
  // Eine Dose gilt als leer, sobald auf eine andere Sorte gewechselt wird
  // (gleiche Regel wie lib/pantry.ts). Aus den Wechseln und der Dosengröße
  // ergibt sich, wie viel wirklich weggeht – die Grammangabe pro Fütterung
  // wäre bei einer Dose, die mehrere Tage für beide Katzen reicht, geraten.
  const sizeByKey = new Map<string, number>()
  const sizeByBrand = new Map<string, number>()
  for (const p of pantry) {
    if (!p.size_grams) continue
    sizeByKey.set(`${p.brand}||${p.type}`.toLowerCase(), p.size_grams)
    if (!sizeByBrand.has(p.brand.toLowerCase())) sizeByBrand.set(p.brand.toLowerCase(), p.size_grams)
  }
  const canSize = (brand: string, type: string) =>
    sizeByKey.get(`${brand}||${type}`.toLowerCase()) ?? sizeByBrand.get(brand.toLowerCase()) ?? null

  let consumedCans = 0
  let consumedGrams = 0
  let cansWithoutSize = 0
  for (let i = 1; i < feedingsRange.length; i++) {
    const prev = feedingsRange[i - 1]
    const curr = feedingsRange[i]
    if (prev.food_type === curr.food_type && prev.food_brand === curr.food_brand) continue
    consumedCans++
    const size = canSize(prev.food_brand, prev.food_type)
    if (size) consumedGrams += size
    else cansWithoutSize++
  }

  // Zeitbasis: vom ersten Eintrag im Zeitraum bis heute
  const consumptionDays = feedingsRange.length
    ? Math.max(1, berlinDaysBetween(feedingsRange[0].logged_at, now) + 1)
    : 0
  const gramsPerDay = consumptionDays > 0 ? Math.round(consumedGrams / consumptionDays) : 0
  const gramsPerCatDay = allCats.length > 0 ? Math.round(gramsPerDay / allCats.length) : 0
  const showConsumption = consumedGrams > 0 && consumptionDays > 0

  // === Fütterungs-Statistik: Sorten im gewählten Zeitraum (Tage, nicht Portionen) ===
  type FoodFreq = { brand: string; type: string; count: number; lastDate: Date }
  const freqMap = new Map<string, FoodFreq>()
  for (const f of feedingDaysRange) {
    const key = `${f.food_brand}||${f.food_type}`
    const d = new Date(f.logged_at)
    if (!freqMap.has(key)) freqMap.set(key, { brand: f.food_brand, type: f.food_type, count: 0, lastDate: d })
    const entry = freqMap.get(key)!
    entry.count++
    if (d > entry.lastDate) entry.lastDate = d
  }
  const foodFrequency = Array.from(freqMap.values())
    .sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime())

  const hour = berlinHour(now)
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 17 ? 'Guten Tag' : 'Guten Abend'

  // === Geburtstag ===
  // Am Tag selbst und am Tag danach bekommt die Karte den Platz ganz oben.
  // Gefeiert wird über den ganzen Haushalt, nicht nur für die aktive Katze.
  const birthdayCat = allCats
    .map(c => ({ cat: c, info: birthdayInfo(c.birthday, now) }))
    .find(x => x.info?.isToday || x.info?.wasYesterday)

  let birthdayPhotos: { id: string; public_url: string }[] = []
  if (birthdayCat) {
    const day = birthdayCat.info!.isToday ? now : addBerlinDays(now, -1)
    const { data: bdPhotos } = await supabase
      .from('photos')
      .select('id, public_url, cat_ids, cat_id, media_type, poster_url')
      .gte('taken_at', berlinDayStart(day).toISOString())
      .lte('taken_at', berlinDayEnd(day).toISOString())
      .order('taken_at', { ascending: false })
    type BdRow = {
      id: string; public_url: string
      cat_ids: string[] | null; cat_id: string | null
      media_type: string | null; poster_url: string | null
    }
    birthdayPhotos = ((bdPhotos ?? []) as BdRow[])
      .filter(p => (p.cat_ids?.length ? p.cat_ids.includes(birthdayCat.cat.id) : p.cat_id === birthdayCat.cat.id))
      // Ein Video ohne Standbild ließe sich in der Geburtstagskarte nicht zeigen
      .filter(hasStill)
      .map(p => ({ id: p.id, public_url: stillUrl(p) }))
  }

  // === Sorten für die Ein-Tipp-Erfassung ===
  // Zuletzt gefütterte zuerst (in 38 von 64 Fällen wiederholt sich die Sorte),
  // danach der restliche Vorrat nach Bestand. Höchstens vier, sonst wird die
  // Karte zur zweiten Sortenliste.
  const lastFedKey = feedingsRange.length
    ? `${feedingsRange[feedingsRange.length - 1].food_brand}||${feedingsRange[feedingsRange.length - 1].food_type}`
    : null
  const quickPantry = pantry.map(p => ({ id: p.id, brand: p.brand, type: p.type, quantity: p.quantity }))
  const quickSorts = [...quickPantry]
    .sort((a, b) => {
      const aLast = `${a.brand}||${a.type}` === lastFedKey
      const bLast = `${b.brand}||${b.type}` === lastFedKey
      if (aLast !== bLast) return aLast ? -1 : 1
      return b.quantity - a.quantity
    })
    .slice(0, 4)

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── GEBURTSTAG ── */}
        {birthdayCat && (
          <BirthdayCard
            cat={{
              id: birthdayCat.cat.id,
              name: birthdayCat.cat.name,
              age: birthdayCat.info!.age,
              isToday: birthdayCat.info!.isToday,
              photoUrl: birthdayCat.cat.photo_url,
              gradient: getCatTheme(birthdayCat.cat.theme).heroGradient,
              accent: getCatTheme(birthdayCat.cat.theme).heroAccent,
            }}
            photos={birthdayPhotos}
          />
        )}

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
              {/* key erzwingt Remount beim Katzenwechsel – sonst überlebt Upload-/Fehler-State den Switch */}
              <CatPhoto key={cat.id} src={cat.photo_url} name={cat.name} theme={cat.theme} size={72} editable catId={cat.id} />
            </div>

            <div className="flex-1 min-w-0">
              <p style={{ color: theme.heroAccentSoft, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                {greeting} 🐾
              </p>
              <h1 style={{ color: 'white', fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {cat.name}
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginTop: 4, letterSpacing: '-0.01em' }}>
                {formatBerlin(now, { weekday: 'long', day: 'numeric', month: 'long' })}
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
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 3, fontWeight: 500 }}>für {householdNames} erfassen</div>
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

        {/* ── BETREUUNG ── */}
        {(awayMode || absenceSoon) && absence && (
          <div
            className="card"
            style={{ padding: '14px 18px', borderLeft: '3px solid var(--am-500, #f59e0b)' }}
          >
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1C1C1E' }}>
              {awayMode ? '🏠 Betreuung läuft' : '🏠 Betreuung steht an'}
              {absence.label ? ` · ${absence.label}` : ''}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.5)', marginTop: 3 }}>
              {formatBerlin(fromBerlinInputValue(absence.starts_on), { day: 'numeric', month: 'long' })}
              {' bis '}
              {formatBerlin(fromBerlinInputValue(absence.ends_on), { day: 'numeric', month: 'long' })}
              {awayMode && absenceDaysLeft >= 0 && ` · noch ${absenceDaysLeft + 1} ${absenceDaysLeft === 0 ? 'Tag' : 'Tage'}`}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)', marginTop: 6 }}>
              {awayMode
                ? 'Die Empfehlung schlägt jetzt nur vor, was im Vorrat steht – nichts Unerprobtes und nichts, was zuletzt Beschwerden gemacht hat.'
                : `Ab dem ${formatBerlin(fromBerlinInputValue(absence.starts_on), { day: 'numeric', month: 'long' })} empfiehlt die App nur noch bewährte Sorten aus dem Vorrat.`}
            </p>

            {/* Was tatsächlich dabei ist. Ohne diese Liste ist "Bedarf: 6 Dosen"
                nicht überprüfbar – man sieht nicht, was davon schon eingepackt ist. */}
            {proviant.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(60,60,67,0.4)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Eingepackt
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                  {[...proviant]
                    .sort((a, b) => b.quantity - a.quantity)
                    .map(s => (
                      <span
                        key={`${s.brand}||${s.type}`}
                        style={{
                          fontSize: 12, padding: '3px 9px', borderRadius: 999,
                          background: 'rgba(60,60,67,0.06)', color: '#3C3C43',
                        }}
                      >
                        {s.type} <strong>{s.quantity}×</strong>
                      </span>
                    ))}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#B45309', marginTop: 8 }}>
                ⚠ Es ist nicht hinterlegt, welche Dosen dabei sind – die Empfehlung
                rechnet deshalb mit dem gesamten Vorrat, auch mit dem, was zuhause steht.{' '}
                <Link href="/einstellungen" style={{ fontWeight: 600 }}>Proviant eintragen</Link>
              </p>
            )}
            {/* Bedarf gegen den tatsächlichen Bestand rechnen. Vorher stand hier
                nur "≈ X Dosen à 800 g" – das stimmt aber nicht, wenn im Vorrat
                auch 400-g-Dosen liegen, und beantwortet die eigentliche Frage
                nicht: Reicht das, was da ist? */}
            {(() => {
              const tage = Math.max(
                0,
                berlinDaysBetween(
                  awayMode ? now : fromBerlinInputValue(absence.starts_on),
                  fromBerlinInputValue(absence.ends_on),
                ) + 1,
              )
              const proTag = gramsPerDay || 400
              const bedarf = tage * proTag

              // Gegen den Proviant rechnen, wenn er hinterlegt ist – sonst
              // gegen den Vorrat, der dann die einzige Grundlage ist.
              const basis = proviant.length > 0
                ? proviant.map(s => ({ quantity: s.quantity, size_grams: s.size_grams }))
                : pantry.map(p => ({ quantity: p.quantity, size_grams: p.size_grams }))

              // Dosengröße fehlt bei alten Einträgen – dann mit 800 g rechnen
              // und darauf hinweisen, statt die Menge stillschweigend auf 0 zu setzen.
              const ohneGroesse = basis.filter(b => !b.size_grams).length
              const vorhanden = basis.reduce((s, b) => s + b.quantity * (b.size_grams ?? 800), 0)
              const reicht = vorhanden >= bedarf
              const fehlt = Math.max(0, bedarf - vorhanden)

              return (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--am-600)', fontWeight: 600 }}>
                    Bedarf: {tage} {tage === 1 ? 'Tag' : 'Tage'} × {proTag} g = {(bedarf / 1000).toFixed(1)} kg
                    {' · '}{proviant.length > 0 ? 'Dabei' : 'Vorrat'}: {(vorhanden / 1000).toFixed(1)} kg
                  </p>
                  <p style={{ fontSize: 12, marginTop: 2, color: reicht ? '#15803D' : '#B45309', fontWeight: 600 }}>
                    {reicht
                      ? `✓ Reicht für den Zeitraum${vorhanden > bedarf ? ` – ${((vorhanden - bedarf) / 1000).toFixed(1)} kg übrig` : ''}`
                      : `⚠ Es fehlen ${(fehlt / 1000).toFixed(1)} kg – rund ${Math.ceil(fehlt / 800)} Dosen à 800 g`}
                  </p>
                  {ohneGroesse > 0 && (
                    <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', marginTop: 2 }}>
                      Bei {ohneGroesse} {ohneGroesse === 1 ? 'Eintrag' : 'Einträgen'} fehlt die Dosengröße – hier mit 800 g gerechnet.{' '}
                      <Link href="/pantry" style={{ fontWeight: 600 }}>Ergänzen</Link>
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── FUTTER-EMPFEHLUNG ── */}
        {bestRec && (
          <div className="card overflow-hidden">
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Empfehlung</h3>
              {/* Klarstellen, worauf sich die Liste stützt – sonst ist nicht zu
                  erkennen, ob eine fehlende Sorte übersehen oder bewusst
                  ausgeschlossen wurde. */}
              {nurProviant && (
                <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)', marginTop: 2 }}>
                  Betreuung – nur aus dem, was eingepackt ist
                </p>
              )}
              {nurVorrat && (
                <p style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>
                  Betreuung – Proviant nicht hinterlegt, gerechnet wird mit dem ganzen Vorrat
                </p>
              )}
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
                          {rec.quantity !== undefined ? `Vorrat: ${rec.quantity}` : 'Vorrat'}
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
                  {formatBerlin(health30[0]?.logged_at ?? '', { day: 'numeric', month: 'short' })}
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
              const label = stool === 'diarrhea' ? 'Durchfall'
                : stool === 'soft' ? 'weich'
                : stool === 'normal' ? 'normal'
                : stool === 'not_observed' ? 'nicht gesehen'
                : 'kein Eintrag'
              return (
                <div
                  key={i}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                  // Antippen/Überfahren verrät den genauen Tag – sonst muss man Punkte abzählen
                  title={`${formatBerlin(day, { weekday: 'long', day: 'numeric', month: 'long' })}: ${label}`}
                >
                  <div style={{
                    width: '100%',
                    aspectRatio: '1',
                    minWidth: 12,
                    borderRadius: 5,
                    background: bg ?? 'rgba(120,120,128,0.1)',
                    border: !bg ? '1.5px dashed rgba(120,120,128,0.22)' : 'none',
                    // Durchfall-Tage hervorheben, damit sie ins Auge springen
                    boxShadow: stool === 'diarrhea' ? '0 0 0 2px rgba(248,113,113,0.35)' : 'none',
                  }} />
                  {/* Tageszahl statt Wochentag: damit lässt sich ein Vorfall direkt datieren */}
                  <span style={{
                    fontSize: 9, lineHeight: 1, letterSpacing: '0.01em',
                    color: stool === 'diarrhea' ? '#DC2626' : 'rgba(60,60,67,0.35)',
                    fontWeight: stool === 'diarrhea' ? 700 : 400,
                  }}>
                    {formatBerlin(day, { day: 'numeric' })}
                  </span>
                  <span style={{ fontSize: 8, color: 'rgba(60,60,67,0.25)', lineHeight: 1 }}>
                    {i % 2 === 0 ? dayLabel(day) : ''}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Wann war Durchfall? Ohne diese Zeile muss man Punkte abzählen –
              und liegt der letzte Vorfall länger als 14 Tage zurück, ist er in
              der Kurve gar nicht zu sehen. */}
          <div style={{ paddingTop: 2, paddingBottom: 10 }}>
            {diarrheaDatesIn14.length > 0 ? (
              <p style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
                Durchfall am {diarrheaDatesIn14.join(', ')}
              </p>
            ) : lastDiarrhea && daysSinceDiarrhea !== null ? (
              <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.5)' }}>
                Letzter Durchfall: {formatBerlin(lastDiarrhea, { day: 'numeric', month: 'long', year: 'numeric' })}
                {' · vor '}{daysSinceDiarrhea} {daysSinceDiarrhea === 1 ? 'Tag' : 'Tagen'}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>
                Noch nie Durchfall erfasst
              </p>
            )}
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

          <QuickFeed sorts={quickSorts} pantry={quickPantry} catIds={allCatIds} householdNames={householdNames} />

          {feedings.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 22, marginBottom: 8 }}>🐾</p>
              <p style={{ fontSize: 14, color: 'rgba(60,60,67,0.4)', fontWeight: 500 }}>
                {multiCat ? `${householdNames} warten auf ihr Futter` : `${cat.name} wartet auf sein Futter`}
              </p>
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

          <QuickHealth catId={cat.id} catName={cat.name} />

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

        {/* ── ZEITRAUM FÜR DIE FUTTER-STATISTIKEN ── */}
        <div className="flex gap-2 flex-wrap">
          {FOOD_RANGES.map(r => (
            <Link
              key={r.key}
              href={r.key === DEFAULT_FOOD_RANGE.key ? '/dashboard' : `/dashboard?futter=${r.key}`}
              scroll={false}
              className="pressable"
              style={{
                fontSize: 13, fontWeight: 600, padding: '7px 15px', borderRadius: 999,
                textDecoration: 'none',
                ...(r.key === foodRange.key
                  ? { background: '#1C1C1E', color: 'white' }
                  : { background: 'white', color: 'rgba(60,60,67,0.6)', border: '0.5px solid rgba(60,60,67,0.14)' }),
              }}
            >
              {r.label}
            </Link>
          ))}
        </div>

        {/* ── VERBRAUCH ── */}
        {showConsumption && (
          <div className="card overflow-hidden">
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>
                Verbrauch · {foodRange.label}
              </h3>
              <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 2 }}>
                aus verbrauchten Dosen und Dosengröße
              </p>
            </div>

            <div className="grid grid-cols-2">
              <div style={{ padding: '18px 20px', borderRight: '0.5px solid rgba(60,60,67,0.07)' }}>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--am-600)' }}>
                  {gramsPerDay}<span style={{ fontSize: 17, fontWeight: 700 }}> g</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(60,60,67,0.5)', marginTop: 6 }}>
                  pro Tag · {householdNames}
                </div>
              </div>
              <div style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1C1E' }}>
                  {gramsPerCatDay}<span style={{ fontSize: 17, fontWeight: 700 }}> g</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(60,60,67,0.5)', marginTop: 6 }}>
                  je Katze und Tag
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 20px 14px', borderTop: '0.5px solid rgba(60,60,67,0.07)' }}>
              <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.45)' }}>
                {consumedCans} Dosen · {(consumedGrams / 1000).toFixed(1).replace('.', ',')} kg in {consumptionDays} Tagen
              </p>
              {cansWithoutSize > 0 && (
                <p style={{ fontSize: 11, color: 'var(--am-600)', marginTop: 4 }}>
                  {cansWithoutSize} {cansWithoutSize === 1 ? 'Dose' : 'Dosen'} ohne hinterlegte Größe – nicht mitgerechnet.{' '}
                  <Link href="/pantry" style={{ fontWeight: 600 }}>Im Vorrat ergänzen</Link>
                </p>
              )}
              <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.3)', marginTop: 4 }}>
                Zählt eine Dose als leer, sobald die Sorte wechselt. Die aktuell angebrochene ist nicht dabei.
              </p>
            </div>
          </div>
        )}

        {/* ── FÜTTERUNGS-STATISTIK ── */}
        {foodFrequency.length > 0 && (
          <div className="card overflow-hidden">
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>
                Futter · {foodRange.label}
              </h3>
              <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 2 }}>
                {foodRange.days === null ? 'gesamter Verlauf' : 'an wie vielen Tagen gefüttert'}
              </p>
            </div>
            <div>
              {foodFrequency.map((f, i) => {
                const info = getFoodInfo(f.brand, f.type)
                const maxCount = Math.max(...foodFrequency.map(x => x.count))
                const barWidth = Math.round((f.count / maxCount) * 100)
                const daysSince = berlinDaysBetween(f.lastDate, now)
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
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1C1E' }}>
                          {f.count} {f.count === 1 ? 'Tag' : 'Tage'}
                        </span>
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
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Futter &amp; Verträglichkeit</h3>
              <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 2 }}>
                Durchfall, weicher Stuhl und Kot im Fell · {foodRange.label}
              </p>
            </div>
            <div style={{ padding: '4px 20px 16px' }}>
              {foodCorrelation.map((s, i) => {
                const pct = Math.round((troubleRate(s) ?? 0) * 100)
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

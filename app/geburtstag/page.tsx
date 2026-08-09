import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import { getCats, getActiveCat } from '@/lib/active-cat.server'
import { getCatTheme } from '@/lib/cat-theme'
import { dedupeSharedFeedings, dedupeFeedingsPerDay } from '@/lib/utils'
import { addBerlinDays, berlinDateKey, formatBerlin } from '@/lib/time'
import { birthdayInfo } from '@/lib/birthday'
import type { Cat, FeedingLog, HealthLog } from '@/lib/types'

type Stat = { value: string; label: string; hint?: string }

function StatTile({ value, label, hint }: Stat) {
  return (
    <div className="card" style={{ padding: '18px 18px 16px' }}>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--am-600)' }}>
        {value}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(60,60,67,0.55)', marginTop: 6, lineHeight: 1.3 }}>
        {label}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'rgba(60,60,67,0.35)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export default async function GeburtstagPage({
  searchParams,
}: {
  searchParams?: { cat?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const allCats = await getCats(supabase)
  const cat: Cat | undefined =
    allCats.find(c => c.id === searchParams?.cat) ?? (await getActiveCat(supabase)) ?? allCats[0]

  if (!cat) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-6">
          <p className="text-gray-500 text-center mt-12">Keine Katze gefunden.</p>
        </main>
      </div>
    )
  }

  const theme = getCatTheme(cat.theme)
  const info = birthdayInfo(cat.birthday)
  const now = new Date()
  const allCatIds = allCats.map(c => c.id)

  // Ausgewertet wird das zurückliegende Jahr. Bewusst 365 Tage statt "seit dem
  // letzten Geburtstag": Der Rückblick soll auch dann etwas zeigen, wenn der
  // Geburtstag gerade erst war – sonst wäre die Seite am Festtag selbst leer.
  const windowStart = addBerlinDays(now, -364)

  const [{ data: feedRaw }, { data: healthRaw }, { data: photosRaw }, { data: weightsRaw }] = await Promise.all([
    supabase.from('feeding_logs').select('*').in('cat_id', allCatIds)
      .gte('logged_at', windowStart.toISOString()).order('logged_at', { ascending: true }),
    supabase.from('health_logs').select('*').eq('cat_id', cat.id)
      .gte('logged_at', windowStart.toISOString()).order('logged_at', { ascending: true }),
    supabase.from('photos').select('id, public_url, taken_at, cat_ids, cat_id')
      .order('taken_at', { ascending: true }),
    supabase.from('weights').select('weight_grams, measured_at').eq('cat_id', cat.id)
      .order('measured_at', { ascending: true }),
  ])

  const feedings = dedupeSharedFeedings((feedRaw ?? []) as FeedingLog[])
  const feedingDays = dedupeFeedingsPerDay(feedings)
  const health = (healthRaw ?? []) as HealthLog[]

  type PhotoRow = { id: string; public_url: string; taken_at: string; cat_ids: string[] | null; cat_id: string | null }
  const photosAll = (photosRaw ?? []) as PhotoRow[]
  const catPhotos = photosAll.filter(p =>
    p.cat_ids?.length ? p.cat_ids.includes(cat.id) : p.cat_id === cat.id,
  )
  const photosInYear = catPhotos.filter(p => new Date(p.taken_at) >= windowStart)

  // Lieblingssorte: an wie vielen Tagen gab es was
  const byType = new Map<string, number>()
  for (const f of feedingDays) {
    const key = f.food_type || f.food_brand
    byType.set(key, (byType.get(key) ?? 0) + 1)
  }
  const favourite = Array.from(byType.entries()).sort((a, b) => b[1] - a[1])[0]

  // Längste durchfallfreie Serie innerhalb des Fensters
  const diarrheaDays = new Set(
    health.filter(h => h.stool_consistency === 'diarrhea').map(h => berlinDateKey(h.logged_at)),
  )
  let longestStreak = 0
  let running = 0
  for (let i = 0; i < 365; i++) {
    const key = berlinDateKey(addBerlinDays(windowStart, i))
    if (diarrheaDays.has(key)) running = 0
    else { running++; longestStreak = Math.max(longestStreak, running) }
  }

  const trackedDays = new Set([
    ...feedings.map(f => berlinDateKey(f.logged_at)),
    ...health.map(h => berlinDateKey(h.logged_at)),
  ]).size

  const weights = (weightsRaw ?? []) as { weight_grams: number; measured_at: string }[]
  const firstWeight = weights[0]
  const lastWeight = weights[weights.length - 1]
  const weightDiff = firstWeight && lastWeight ? lastWeight.weight_grams - firstWeight.weight_grams : null

  const firstPhoto = catPhotos[0]
  const lastPhoto = catPhotos[catPhotos.length - 1]

  const stats: Stat[] = [
    { value: String(trackedDays), label: 'Tage begleitet', hint: 'mit Futter- oder Befinden-Eintrag' },
    { value: String(feedingDays.length), label: 'Futter-Tage', hint: 'Sorten pro Tag gezählt' },
    { value: String(longestStreak), label: 'Tage am Stück ohne Durchfall' },
    { value: String(photosInYear.length), label: 'Fotos im Jahr' },
  ]

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">← Zurück</Link>
          <h1 className="text-xl font-bold text-gray-800">🎁 {cat.name}s Jahr</h1>
        </div>

        {/* Hero */}
        <div
          className="rounded-3xl relative overflow-hidden"
          style={{ background: theme.heroGradient, boxShadow: '0 8px 36px rgba(0,0,0,0.22)', padding: 24 }}
        >
          <div className="absolute" style={{ inset: 0, backgroundImage: theme.heroGlow, pointerEvents: 'none' }} />
          <div className="relative text-center">
            {cat.photo_url && (
              <div style={{ width: 88, height: 88, margin: '0 auto 14px', borderRadius: '50%', overflow: 'hidden', border: '3px solid rgba(255,255,255,0.85)', position: 'relative' }}>
                <Image src={cat.photo_url} alt="" fill className="object-cover" sizes="88px" />
              </div>
            )}
            <h2 style={{ color: 'white', fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {cat.name}
            </h2>
            {info ? (
              <>
                <p style={{ color: theme.heroAccent, fontSize: 15, fontWeight: 700, marginTop: 6 }}>
                  {info.currentAge} {info.currentAge === 1 ? 'Jahr' : 'Jahre'} alt
                </p>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>
                  geboren am {formatBerlin(`${cat.birthday}T12:00:00`, { day: 'numeric', month: 'long', year: 'numeric' })}
                  {!info.isToday && info.daysUntil > 0 && ` · nächster Geburtstag in ${info.daysUntil} ${info.daysUntil === 1 ? 'Tag' : 'Tagen'}`}
                </p>
              </>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 8 }}>
                Noch kein Geburtstag hinterlegt ·{' '}
                <Link href="/einstellungen" style={{ color: 'white', fontWeight: 700 }}>nachtragen</Link>
              </p>
            )}
          </div>
        </div>

        {/* Kennzahlen */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map(s => <StatTile key={s.label} {...s} />)}
        </div>

        {/* Lieblingsfutter */}
        {favourite && (
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(60,60,67,0.4)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Meistgefüttert
            </p>
            <p style={{ fontSize: 19, fontWeight: 700, color: '#1C1C1E', marginTop: 5, letterSpacing: '-0.02em' }}>
              {favourite[0]}
            </p>
            <p style={{ fontSize: 13, color: 'rgba(60,60,67,0.45)', marginTop: 3 }}>
              an {favourite[1]} {favourite[1] === 1 ? 'Tag' : 'Tagen'}
            </p>
          </div>
        )}

        {/* Gewicht */}
        {firstWeight && lastWeight && weights.length > 1 && (
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(60,60,67,0.4)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Gewicht
            </p>
            <div className="flex items-baseline gap-3 mt-2">
              <span style={{ fontSize: 22, fontWeight: 700, color: '#1C1C1E' }}>
                {(lastWeight.weight_grams / 1000).toFixed(2).replace('.', ',')} kg
              </span>
              {weightDiff !== null && weightDiff !== 0 && (
                <span style={{ fontSize: 14, fontWeight: 600, color: weightDiff > 0 ? '#16A34A' : '#DC2626' }}>
                  {weightDiff > 0 ? '+' : '−'}{Math.abs(weightDiff)} g
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 3 }}>
              seit {formatBerlin(firstWeight.measured_at, { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Damals und heute */}
        {firstPhoto && lastPhoto && firstPhoto.id !== lastPhoto.id && (
          <div className="card overflow-hidden">
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Damals und heute</h3>
            </div>
            <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(60,60,67,0.07)' }}>
              {[firstPhoto, lastPhoto].map((p, i) => (
                <div key={p.id} style={{ background: 'white', padding: 12 }}>
                  <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden' }}>
                    <Image src={p.public_url} alt="" fill className="object-cover" sizes="50vw" />
                  </div>
                  <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.45)', marginTop: 7, textAlign: 'center' }}>
                    {i === 0 ? 'erstes Foto' : 'neuestes Foto'}<br />
                    {formatBerlin(p.taken_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fotostrecke */}
        {photosInYear.length > 2 && (
          <div className="card overflow-hidden">
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>Das Jahr in Bildern</h3>
            </div>
            <div className="grid grid-cols-4 gap-1 p-3">
              {photosInYear.slice(-12).reverse().map(p => (
                <Link key={p.id} href="/fotos" style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden' }}>
                  <Image src={p.public_url} alt="" fill className="object-cover" sizes="25vw" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.3)', textAlign: 'center', paddingBottom: 8 }}>
          Ausgewertet werden die letzten 365 Tage
          {trackedDays > 0 && ` · erfasst an ${trackedDays} Tagen`}
        </p>
      </main>
    </div>
  )
}

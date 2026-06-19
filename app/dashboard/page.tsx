import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import {
  formatTime,
  getDayStart,
  getDayEnd,
  isSameDay,
  getStoolLabel,
  getStoolColor,
  getStoolDot,
  getAppetiteLabel,
  getActivityLabel,
} from '@/lib/utils'
import type { FeedingLog, HealthLog } from '@/lib/types'

function getPast7Days(): Date[] {
  const days: Date[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d)
  }
  return days
}

function formatDayShort(date: Date): string {
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' })
}

export default async function DashboardPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Katze holen oder anlegen
  let { data: cats } = await supabase
    .from('cats')
    .select('*')
    .eq('owner_id', user.id)
    .limit(1)

  let cat = cats?.[0]

  if (!cat) {
    const { data: newCat } = await supabase
      .from('cats')
      .insert({ name: 'Joschi', owner_id: user.id })
      .select()
      .single()
    cat = newCat
  }

  if (!cat) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Fehler beim Laden. Bitte Seite neu laden.</p>
      </div>
    )
  }

  const todayStart = getDayStart()
  const todayEnd = getDayEnd()

  // Heutige Futter-Einträge
  const { data: todayFeedings } = await supabase
    .from('feeding_logs')
    .select('*')
    .eq('cat_id', cat.id)
    .gte('logged_at', todayStart)
    .lte('logged_at', todayEnd)
    .order('logged_at', { ascending: true })

  // Heutige Befinden-Einträge
  const { data: todayHealth } = await supabase
    .from('health_logs')
    .select('*')
    .eq('cat_id', cat.id)
    .gte('logged_at', todayStart)
    .lte('logged_at', todayEnd)
    .order('logged_at', { ascending: false })
    .limit(1)

  // Letzte 7 Tage – alle Logs
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  const { data: weekFeedings } = await supabase
    .from('feeding_logs')
    .select('logged_at')
    .eq('cat_id', cat.id)
    .gte('logged_at', sevenDaysAgo.toISOString())

  const { data: weekHealth } = await supabase
    .from('health_logs')
    .select('logged_at, stool_consistency, vomiting, fur_issue')
    .eq('cat_id', cat.id)
    .gte('logged_at', sevenDaysAgo.toISOString())

  const past7Days = getPast7Days()

  const latestHealth = todayHealth?.[0] as HealthLog | undefined
  const feedings = (todayFeedings ?? []) as FeedingLog[]

  return (
    <div className="min-h-screen bg-amber-50">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Heutiger Status */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Heute
          </h2>

          <div className="grid grid-cols-2 gap-3">
            {/* Befinden */}
            <div className="card p-4">
              <p className="text-xs text-gray-400 mb-1">Befinden</p>
              {latestHealth ? (
                <div className="space-y-1">
                  <span
                    className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${getStoolColor(
                      latestHealth.stool_consistency
                    )}`}
                  >
                    {getStoolLabel(latestHealth.stool_consistency)}
                  </span>
                  <div className="flex gap-2 text-xs text-gray-500 flex-wrap">
                    <span>Appetit: {getAppetiteLabel(latestHealth.appetite)}</span>
                  </div>
                  {latestHealth.vomiting && (
                    <span className="text-xs text-red-500">⚠ Erbrochen</span>
                  )}
                  {latestHealth.fur_issue && (
                    <span className="text-xs text-orange-500 block">⚠ Fell-Problem</span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mt-1">Noch nichts eingetragen</p>
              )}
            </div>

            {/* Futter */}
            <div className="card p-4">
              <p className="text-xs text-gray-400 mb-1">Futter heute</p>
              {feedings.length > 0 ? (
                <div className="space-y-1.5">
                  {feedings.map((f) => (
                    <div key={f.id}>
                      <p className="text-sm font-medium text-gray-700 leading-tight">
                        {f.food_brand}
                      </p>
                      <p className="text-xs text-gray-400">
                        {f.food_type}
                        {f.amount_grams ? ` · ${f.amount_grams}g` : ''}
                        {' · '}
                        {formatTime(f.logged_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mt-1">Noch nichts eingetragen</p>
              )}
            </div>
          </div>
        </section>

        {/* Schnell-Aktionen */}
        <section className="grid grid-cols-2 gap-3">
          <Link href="/feeding/new" className="card p-4 flex flex-col items-center gap-2 hover:bg-amber-50 transition-colors active:scale-95">
            <span className="text-3xl">🍽️</span>
            <span className="text-sm font-medium text-gray-700 text-center">Futter eintragen</span>
          </Link>
          <Link href="/health/new" className="card p-4 flex flex-col items-center gap-2 hover:bg-amber-50 transition-colors active:scale-95">
            <span className="text-3xl">💊</span>
            <span className="text-sm font-medium text-gray-700 text-center">Befinden eintragen</span>
          </Link>
        </section>

        {/* 7-Tage-Übersicht */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Letzte 7 Tage
          </h2>
          <div className="card divide-y divide-gray-50">
            {past7Days.map((day, idx) => {
              const isToday = idx === 6

              const dayFeedings = (weekFeedings ?? []).filter((f) =>
                isSameDay(new Date(f.logged_at), day)
              )

              const dayHealthLogs = (weekHealth ?? []).filter((h) =>
                isSameDay(new Date(h.logged_at), day)
              )

              const latestDayHealth = dayHealthLogs[0]
              const hasDiarrhea = dayHealthLogs.some(
                (h) => h.stool_consistency === 'diarrhea'
              )
              const hasIssues =
                hasDiarrhea ||
                dayHealthLogs.some((h) => h.vomiting || h.fur_issue)

              return (
                <div
                  key={day.toISOString()}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    hasDiarrhea ? 'bg-red-50' : ''
                  }`}
                >
                  <div className="w-16 shrink-0">
                    <p
                      className={`text-xs font-medium ${
                        isToday ? 'text-amber-600' : 'text-gray-500'
                      }`}
                    >
                      {isToday ? 'Heute' : formatDayShort(day)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {latestDayHealth ? (
                      <div
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStoolDot(
                          latestDayHealth.stool_consistency
                        )}`}
                        title={getStoolLabel(latestDayHealth.stool_consistency)}
                      />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-gray-200" />
                    )}

                    <p className="text-xs text-gray-500 truncate">
                      {dayFeedings.length > 0
                        ? `${dayFeedings.length}× Futter`
                        : 'Kein Futter'}
                    </p>

                    {hasIssues && (
                      <span className="text-xs text-red-500 shrink-0">⚠</span>
                    )}
                  </div>

                  {dayHealthLogs.length === 0 && dayFeedings.length === 0 && (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}

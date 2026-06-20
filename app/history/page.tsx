import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import {
  isSameDay,
  getStoolLabel,
  getStoolColor,
  getAppetiteLabel,
  getActivityLabel,
} from '@/lib/utils'
import type { FeedingLog, HealthLog } from '@/lib/types'

function formatDayFull(date: Date): string {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (isSameDay(date, today)) return 'Heute'
  if (isSameDay(date, yesterday)) return 'Gestern'

  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })
}

function getPast30Days(): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 30; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d)
  }
  return days
}

export default async function HistoryPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: cats } = await supabase
    .from('cats')
    .select('id')
    .limit(1)

  const cat = cats?.[0]

  if (!cat) {
    return (
      <div className="min-h-screen bg-amber-50">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-6">
          <p className="text-gray-500 text-center mt-12">
            Bitte zuerst das Dashboard öffnen, um Joschi anzulegen.
          </p>
        </main>
      </div>
    )
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const [{ data: allHealth }, { data: allFeedings }] = await Promise.all([
    supabase
      .from('health_logs')
      .select('*')
      .eq('cat_id', cat.id)
      .gte('logged_at', thirtyDaysAgo.toISOString())
      .order('logged_at', { ascending: false }),
    supabase
      .from('feeding_logs')
      .select('*')
      .eq('cat_id', cat.id)
      .gte('logged_at', thirtyDaysAgo.toISOString())
      .order('logged_at', { ascending: true }),
  ])

  const health = (allHealth ?? []) as HealthLog[]
  const feedings = (allFeedings ?? []) as FeedingLog[]

  const days = getPast30Days()

  type DayEntry = {
    date: Date
    healthLogs: HealthLog[]
    feedingLogs: FeedingLog[]
    hasDiarrhea: boolean
    hasIssues: boolean
  }

  const dayEntries: DayEntry[] = days.map((date) => {
    const dayHealth = health.filter((h) => isSameDay(new Date(h.logged_at), date))
    const dayFeedings = feedings.filter((f) => isSameDay(new Date(f.logged_at), date))
    const hasDiarrhea = dayHealth.some((h) => h.stool_consistency === 'diarrhea')
    const hasIssues = hasDiarrhea || dayHealth.some((h) => h.vomiting || h.fur_issue)
    return { date, healthLogs: dayHealth, feedingLogs: dayFeedings, hasDiarrhea, hasIssues }
  })

  const diarrheaDays = dayEntries.filter((d) => d.hasDiarrhea).length

  return (
    <div className="min-h-screen bg-amber-50">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Verlauf – letzte 30 Tage</h1>
          {diarrheaDays > 0 && (
            <span className="text-xs bg-red-100 text-red-700 font-medium px-3 py-1.5 rounded-full">
              {diarrheaDays}× Durchfall
            </span>
          )}
        </div>

        {/* Legende */}
        <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
            Normal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
            Weich
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            Durchfall
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />
            Nicht gesehen
          </span>
        </div>

        {/* Tage-Liste */}
        <div className="space-y-3">
          {dayEntries.map(({ date, healthLogs, feedingLogs, hasDiarrhea, hasIssues }) => {
            const isEmpty = healthLogs.length === 0 && feedingLogs.length === 0
            const y = date.getFullYear()
            const m = String(date.getMonth() + 1).padStart(2, '0')
            const d = String(date.getDate()).padStart(2, '0')
            const dateStr = `${y}-${m}-${d}`

            return (
              <div
                key={date.toISOString()}
                className={`card overflow-hidden ${hasDiarrhea ? 'border-red-200' : ''}`}
              >
                {/* Tages-Header */}
                <div className={`flex items-center justify-between px-4 py-2.5 border-b ${hasDiarrhea ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                  <span className={`font-medium text-sm ${hasDiarrhea ? 'text-red-700' : 'text-gray-700'}`}>
                    {formatDayFull(date)}{hasDiarrhea && ' ⚠'}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link href={`/feeding/new?date=${dateStr}`} className="text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors font-medium">
                      + Futter
                    </Link>
                    <Link href={`/health/new?date=${dateStr}`} className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors font-medium">
                      + Befinden
                    </Link>
                  </div>
                </div>

                {!isEmpty && (
                  <div className="divide-y divide-gray-50">
                    {/* Befinden */}
                    {healthLogs.length > 0 && (
                      <div className="divide-y divide-gray-50">
                        {healthLogs.map((h) => (
                          <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap gap-1.5 items-center">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStoolColor(h.stool_consistency)}`}>
                                  {getStoolLabel(h.stool_consistency)}
                                </span>
                                {h.vomiting && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Erbrochen</span>}
                                {h.fur_issue && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Fell</span>}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">
                                Appetit: {getAppetiteLabel(h.appetite)} · {getActivityLabel(h.activity)} · {new Date(h.logged_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <Link
                              href={`/health/${h.id}/edit`}
                              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-amber-50 text-base"
                            >✏️</Link>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Futter */}
                    {feedingLogs.length > 0 && (
                      <div className="divide-y divide-gray-50">
                        {feedingLogs.map((f) => (
                          <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-700 truncate">{f.food_brand} – {f.food_type}</p>
                              <p className="text-xs text-gray-400">
                                {f.amount_grams ? `${f.amount_grams}g · ` : ''}
                                {new Date(f.logged_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <Link
                              href={`/feeding/${f.id}/edit`}
                              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-amber-50 text-base"
                            >✏️</Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

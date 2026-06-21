'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { toLocalISOString } from '@/lib/utils'
import type { StoolConsistency, Appetite, Activity } from '@/lib/types'

interface ToggleGroupProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; color?: string }[]
}

function ToggleGroup<T extends string>({ value, onChange, options }: ToggleGroupProps<T>) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
          className={`flex-1 min-w-[70px] py-2.5 px-2 rounded-xl text-sm font-medium transition-all border ${
            value === opt.value ? opt.color ?? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >{opt.label}</button>
      ))}
    </div>
  )
}

function YesNoToggle({ value, onChange, yesLabel = 'Ja', noLabel = 'Nein', yesColor = 'bg-red-500 border-red-500 text-white' }: {
  value: boolean; onChange: (v: boolean) => void; yesLabel?: string; noLabel?: string; yesColor?: string
}) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => onChange(true)}
        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${value ? yesColor : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
      >{yesLabel}</button>
      <button type="button" onClick={() => onChange(false)}
        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${!value ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
      >{noLabel}</button>
    </div>
  )
}

export default function EditHealthPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [loggedAt, setLoggedAt] = useState('')
  const [stool, setStool] = useState<StoolConsistency>('not_observed')
  const [vomiting, setVomiting] = useState(false)
  const [appetite, setAppetite] = useState<Appetite>('good')
  const [activity, setActivity] = useState<Activity>('normal')
  const [furIssue, setFurIssue] = useState(false)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: entry } = await supabase
        .from('health_logs')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (!entry) { setNotFound(true); return }

      setLoggedAt(toLocalISOString(new Date(entry.logged_at)))
      setStool(entry.stool_consistency ?? 'not_observed')
      setVomiting(entry.vomiting ?? false)
      setAppetite(entry.appetite ?? 'good')
      setActivity(entry.activity ?? 'normal')
      setFurIssue(entry.fur_issue ?? false)
      setNotes(entry.notes ?? '')
    }
    init()
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('health_logs')
      .update({
        logged_at: new Date(loggedAt).toISOString(),
        stool_consistency: stool,
        vomiting,
        appetite,
        activity,
        fur_issue: furIssue,
        notes: notes.trim() || null,
      })
      .eq('id', id)

    if (updateError) {
      setError('Fehler beim Speichern.')
      setLoading(false)
    } else {
      router.back()
    }
  }

  const handleDelete = async () => {
    if (!confirm('Eintrag wirklich löschen?')) return
    setDeleting(true)
    await supabase.from('health_logs').delete().eq('id', id)
    router.back()
  }

  const stoolOptions: { value: StoolConsistency; label: string; color?: string }[] = [
    { value: 'normal', label: '✓ Normal', color: 'bg-green-500 border-green-500 text-white' },
    { value: 'soft', label: '~ Weich', color: 'bg-yellow-400 border-yellow-400 text-white' },
    { value: 'diarrhea', label: '⚠ Durchfall', color: 'bg-red-500 border-red-500 text-white' },
    { value: 'not_observed', label: '— Nicht gesehen', color: 'bg-gray-400 border-gray-400 text-white' },
  ]

  const appetiteOptions: { value: Appetite; label: string }[] = [
    { value: 'good', label: '😋 Gut' },
    { value: 'reduced', label: '😐 Wenig' },
    { value: 'none', label: '😞 Gar nicht' },
  ]

  const activityOptions: { value: Activity; label: string }[] = [
    { value: 'normal', label: '🐾 Normal' },
    { value: 'tired', label: '😴 Müde' },
    { value: 'very_active', label: '🏃 Sehr aktiv' },
  ]

  if (notFound) return (
    <div className="min-h-screen"><Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-gray-500 text-center mt-12">Eintrag nicht gefunden.</p>
      </main>
    </div>
  )

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">← Zurück</button>
            <h1 className="text-xl font-bold text-gray-800">💊 Befinden bearbeiten</h1>
          </div>
          <button onClick={handleDelete} disabled={deleting} className="text-sm text-red-400 hover:text-red-600 transition-colors">
            {deleting ? 'Löschen…' : 'Löschen'}
          </button>
        </div>

        <div className="card p-5">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="loggedAt" className="label">Uhrzeit</label>
              <input id="loggedAt" type="datetime-local" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} className="input-field" required />
            </div>

            <div>
              <label className="label">Stuhlgang</label>
              <ToggleGroup value={stool} onChange={setStool} options={stoolOptions} />
            </div>

            <div>
              <label className="label">Erbrochen?</label>
              <YesNoToggle value={vomiting} onChange={setVomiting} />
            </div>

            <div>
              <label className="label">Appetit</label>
              <ToggleGroup value={appetite} onChange={setAppetite} options={appetiteOptions} />
            </div>

            <div>
              <label className="label">Aktivität</label>
              <ToggleGroup value={activity} onChange={setActivity} options={activityOptions} />
            </div>

            <div>
              <label className="label">Kot im Fell? <span className="text-gray-400 font-normal text-xs">(wichtig bei Langhaar)</span></label>
              <YesNoToggle value={furIssue} onChange={setFurIssue} yesLabel="Ja, Kot im Fell" noLabel="Nein" yesColor="bg-orange-500 border-orange-500 text-white" />
            </div>

            <div>
              <label htmlFor="notes" className="label">Notiz <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field resize-none" rows={3} placeholder="z.B. hat viel getrunken heute" />
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => router.back()} className="btn-secondary">Abbrechen</button>
              <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Speichern...' : 'Speichern'}</button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

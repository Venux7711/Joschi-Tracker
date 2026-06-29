'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { toLocalISOString } from '@/lib/utils'

const ANIFIT_SORTEN = [
  'Puterichs Delight (Truthahn)',
  'Powertöpfchen (Lamm/Huhn)',
  'Délice de Coeur (Huhn)',
  'Fisch à la Mode (Lachs/Huhn/Rentier)',
  'Nautilus Ragout (Hering/Lachs)',
  'Eismeer Terrine (Hering/Weißfisch/Lachs)',
  'Bio Enten-Energie (Ente)',
  'Bio Steak Sensation (Rind)',
]

const MENGE_LABELS = ['Nichts', 'Sehr wenig', 'Wenig', 'Mittel', 'Viel']

function MengeSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="label mb-0">{label}</span>
        <span className="text-sm font-medium text-amber-600">{MENGE_LABELS[value]}</span>
      </div>
      <input
        type="range" min={0} max={4} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>Nichts</span><span>Viel</span>
      </div>
    </div>
  )
}

export default function EditFeedingPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [foodBrand, setFoodBrand] = useState('Anifit')
  const [foodType, setFoodType] = useState('')
  const [amountGrams, setAmountGrams] = useState('')
  const [loggedAt, setLoggedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [treatAmount, setTreatAmount] = useState(0)
  const [dryFoodAmount, setDryFoodAmount] = useState(0)
  const [extras, setExtras] = useState('')
  const [prevBrands, setPrevBrands] = useState<string[]>([])
  const [prevTypes, setPrevTypes] = useState<string[]>([])
  const [pantry, setPantry] = useState<{ id: string; brand: string; type: string; quantity: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const isAnifit = foodBrand.trim().toLowerCase() === 'anifit'

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: entry } = await supabase
        .from('feeding_logs')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (!entry) { setNotFound(true); return }

      setFoodBrand(entry.food_brand ?? 'Anifit')
      setFoodType(entry.food_type ?? '')
      setAmountGrams(entry.amount_grams ? String(entry.amount_grams) : '')
      setLoggedAt(toLocalISOString(new Date(entry.logged_at)))
      setNotes(entry.notes ?? '')
      setTreatAmount(entry.treat_amount ?? 0)
      setDryFoodAmount(entry.dry_food_amount ?? 0)
      setExtras(entry.extras ?? '')

      const { data: logs } = await supabase
        .from('feeding_logs')
        .select('food_brand, food_type')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(100)

      if (logs) {
        setPrevBrands(Array.from(new Set(logs.map((l) => l.food_brand))).filter(Boolean))
        setPrevTypes(Array.from(new Set(logs.map((l) => l.food_type))).filter(Boolean))
      }

      const pantryRes = await fetch('/api/pantry')
      const pantryData = await pantryRes.json()
      if (pantryData.items) setPantry(pantryData.items)
    }
    init()
  }, [id])

  const changeBrand = (b: string) => { setFoodBrand(b); setFoodType('') }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('feeding_logs')
      .update({
        logged_at: new Date(loggedAt).toISOString(),
        food_brand: foodBrand.trim(),
        food_type: foodType.trim(),
        amount_grams: amountGrams ? parseInt(amountGrams, 10) : null,
        notes: notes.trim() || null,
        treat_amount: treatAmount > 0 ? treatAmount : null,
        dry_food_amount: dryFoodAmount > 0 ? dryFoodAmount : null,
        extras: extras.trim() || null,
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
    await supabase.from('feeding_logs').delete().eq('id', id)
    router.back()
  }

  const brandOptions = (() => {
    const seen = new Set(['anifit'])
    const result = ['Anifit']
    for (const b of [...pantry.map((p) => p.brand), ...prevBrands]) {
      const key = b?.trim().toLowerCase()
      if (key && !seen.has(key)) { seen.add(key); result.push(b.trim()) }
    }
    return result
  })()

  const pantryForBrand = pantry.filter(
    (p) => p.brand.toLowerCase() === foodBrand.trim().toLowerCase() && p.quantity > 0
  )
  // Aktuelle Sorte immer enthalten, damit der geladene Wert wählbar bleibt
  const baseTypes = pantryForBrand.length > 0
    ? Array.from(new Set([...pantryForBrand.map((p) => p.type), ...(isAnifit ? [] : prevTypes)]))
    : isAnifit
      ? ANIFIT_SORTEN
      : prevTypes
  const typeOptions = (foodType && !baseTypes.includes(foodType)
    ? [foodType, ...baseTypes]
    : baseTypes).filter(Boolean)

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
            <h1 className="text-xl font-bold text-gray-800">🍽️ Futter bearbeiten</h1>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm text-red-400 hover:text-red-600 transition-colors"
          >
            {deleting ? 'Löschen…' : 'Löschen'}
          </button>
        </div>

        <div className="card p-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="foodBrand" className="label">Marke *</label>
              <select id="foodBrand" value={foodBrand} onChange={(e) => changeBrand(e.target.value)} className="input-field" required>
                {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                {!brandOptions.some((b) => b.toLowerCase() === foodBrand.toLowerCase()) && foodBrand && (
                  <option value={foodBrand}>{foodBrand}</option>
                )}
              </select>
            </div>

            <div>
              <label htmlFor="foodType" className="label">Sorte *</label>
              {typeOptions.length > 0 ? (
                <select id="foodType" value={foodType} onChange={(e) => setFoodType(e.target.value)} className="input-field" required>
                  <option value="">Sorte wählen …</option>
                  {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <input id="foodType" type="text" value={foodType} onChange={(e) => setFoodType(e.target.value)} className="input-field" placeholder="z.B. Nassfutter Huhn" required />
              )}
            </div>

            <div>
              <label htmlFor="amountGrams" className="label">Menge in Gramm <span className="text-gray-400 font-normal">(optional)</span></label>
              <input id="amountGrams" type="number" min="1" max="999" value={amountGrams} onChange={(e) => setAmountGrams(e.target.value)} className="input-field" placeholder="z.B. 800" />
            </div>

            <div>
              <label htmlFor="loggedAt" className="label">Uhrzeit *</label>
              <input id="loggedAt" type="datetime-local" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} className="input-field" required />
            </div>

            <hr className="border-gray-100" />
            <MengeSlider label="🍖 Leckerli" value={treatAmount} onChange={setTreatAmount} />
            <MengeSlider label="🥣 Trockenfutter" value={dryFoodAmount} onChange={setDryFoodAmount} />

            <div>
              <label htmlFor="extras" className="label">Sonstiges <span className="text-gray-400 font-normal">(optional)</span></label>
              <input id="extras" type="text" value={extras} onChange={(e) => setExtras(e.target.value)} className="input-field" placeholder="z.B. Thunfisch, Hühnchen gekocht …" />
            </div>

            <div>
              <label htmlFor="notes" className="label">Notiz <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field resize-none" rows={2} placeholder="z.B. hat alles aufgefressen" />
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

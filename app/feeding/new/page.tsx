'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

const ANIFIT_BRAND = 'Anifit'

function MengeSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="label mb-0">{label}</span>
        <span className="text-sm font-medium text-amber-600">{MENGE_LABELS[value]}</span>
      </div>
      <input
        type="range"
        min={0}
        max={4}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>Nichts</span>
        <span>Viel</span>
      </div>
    </div>
  )
}

function NewFeedingForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dateParam = searchParams.get('date')
  const supabase = createClient()

  const [catId, setCatId] = useState<string | null>(null)
  const [foodBrand, setFoodBrand] = useState('Anifit')
  const [foodType, setFoodType] = useState('')
  const [amountGrams, setAmountGrams] = useState('')
  const [loggedAt, setLoggedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [treatAmount, setTreatAmount] = useState(0)
  const [dryFoodAmount, setDryFoodAmount] = useState(0)
  const [extras, setExtras] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanSuccess, setScanSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prevBrands, setPrevBrands] = useState<string[]>([])
  const [prevTypes, setPrevTypes] = useState<string[]>([])
  const [pantry, setPantry] = useState<{ id: string; brand: string; type: string; quantity: number }[]>([])

  const isAnifit = foodBrand.trim().toLowerCase() === 'anifit'

  useEffect(() => {
    setLoggedAt(dateParam ? `${dateParam}T12:00` : toLocalISOString())

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: cats } = await supabase
        .from('cats')
        .select('id')
        .limit(1)

      if (cats && cats.length > 0) setCatId(cats[0].id)

      const { data: logs } = await supabase
        .from('feeding_logs')
        .select('food_brand, food_type')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(100)

      if (logs) {
        const brands = Array.from(new Set(logs.map((l) => l.food_brand))).filter(Boolean)
        const types = Array.from(new Set(logs.map((l) => l.food_type))).filter(Boolean)
        setPrevBrands(brands)
        setPrevTypes(types)
      }

      const pantryRes = await fetch('/api/pantry')
      const pantryData = await pantryRes.json()
      if (pantryData.items) setPantry(pantryData.items)
    }

    init()
  }, [])

  // Sorte zurücksetzen wenn Marke wechselt
  useEffect(() => {
    setFoodType('')
  }, [foodBrand])

  const handleScanImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    setScanSuccess(false)
    setError(null)

    const formData = new FormData()
    formData.append('image', file)

    try {
      const res = await fetch('/api/analyze-can', { method: 'POST', body: formData })
      const data = await res.json()

      if (data.brand) setFoodBrand(data.brand)
      if (data.type) setFoodType(data.type)
      if (data.amount_grams) setAmountGrams(String(data.amount_grams))
      setScanSuccess(true)
    } catch {
      setError('Dosenscan fehlgeschlagen. Bitte manuell eingeben.')
    } finally {
      setScanning(false)
      e.target.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!catId) {
      setError('Katze nicht gefunden. Bitte zuerst das Dashboard öffnen.')
      return
    }
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: insertError } = await supabase.from('feeding_logs').insert({
      cat_id: catId,
      user_id: user.id,
      logged_at: new Date(loggedAt).toISOString(),
      food_brand: foodBrand.trim(),
      food_type: foodType.trim(),
      amount_grams: amountGrams ? parseInt(amountGrams, 10) : null,
      notes: notes.trim() || null,
      treat_amount: treatAmount > 0 ? treatAmount : null,
      dry_food_amount: dryFoodAmount > 0 ? dryFoodAmount : null,
      extras: extras.trim() || null,
    })

    if (insertError) {
      setError('Fehler beim Speichern. Bitte erneut versuchen.')
      setLoading(false)
      return
    }

    // Vorrat automatisch reduzieren wenn Sorte wechselt
    const { data: lastLogs } = await supabase
      .from('feeding_logs')
      .select('food_brand, food_type')
      .eq('cat_id', catId)
      .order('logged_at', { ascending: false })
      .limit(10)

    if (lastLogs && lastLogs.length >= 2) {
      // Letzter Eintrag vor dem gerade gespeicherten
      const prev = lastLogs[1]
      const newBrand = foodBrand.trim().toLowerCase()
      const prevBrand = prev.food_brand?.toLowerCase()
      const newType = foodType.trim()
      const prevType = prev.food_type

      // Sorte hat gewechselt â†’ alte Dose ist leer
      if (prevBrand === newBrand && prevType && prevType !== newType) {
        const prevPantryItem = pantry.find(
          p => p.brand.toLowerCase() === prevBrand && p.type === prevType && p.quantity > 0
        )
        if (prevPantryItem) {
          await fetch('/api/pantry', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: prevPantryItem.id, quantity: prevPantryItem.quantity - 1 }),
          })
        }
      }
    }

    router.push('/dashboard')
  }

  // Marken-Liste: Anifit immer zuerst, dann andere
  const brandOptions = [
    'Anifit',
    ...prevBrands.filter((b) => b.toLowerCase() !== 'anifit'),
  ]

  // Sorten-Liste: Vorrats-Sorten der jeweiligen Marke, sonst frühere Eingaben
  const pantryForBrand = pantry.filter(
    (p) => p.brand.toLowerCase() === foodBrand.trim().toLowerCase() && p.quantity > 0
  )
  const typeOptions = pantryForBrand.length > 0
    ? pantryForBrand.map((p) => p.type)
    : isAnifit
      ? ANIFIT_SORTEN
      : prevTypes

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
            â† Zurück
          </Link>
          <h1 className="text-xl font-bold text-gray-800">ðŸ½ï¸ Futter eintragen</h1>
        </div>

        {/* Dosenscan */}
        <div className="card p-4 mb-4">
          <label className="flex flex-col items-center gap-2 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleScanImage}
              disabled={scanning}
            />
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-colors ${
              scanning ? 'bg-amber-100' : scanSuccess ? 'bg-green-100' : 'bg-amber-50 hover:bg-amber-100'
            }`}>
              {scanning ? '⏳' : scanSuccess ? 'âœ…' : 'ðŸ“·'}
            </div>
            <span className="text-sm font-medium text-gray-700">
              {scanning ? 'Dose wird analysiert…' : scanSuccess ? 'Felder ausgefüllt!' : 'Dose fotografieren'}
            </span>
            <span className="text-xs text-gray-400">
              Kamera öffnen â†’ Formular wird automatisch ausgefüllt
            </span>
          </label>
        </div>

        <div className="card p-5">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Marke */}
            <div>
              <label htmlFor="foodBrand" className="label">Marke *</label>
              <select
                id="foodBrand"
                value={foodBrand}
                onChange={(e) => setFoodBrand(e.target.value)}
                className="input-field"
                required
              >
                {brandOptions.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                {!brandOptions.some((b) => b.toLowerCase() === foodBrand.toLowerCase()) && foodBrand && (
                  <option value={foodBrand}>{foodBrand}</option>
                )}
              </select>
            </div>

            {/* Sorte */}
            <div>
              <label htmlFor="foodType" className="label">Sorte *</label>
              {typeOptions.length > 0 ? (
                <select
                  id="foodType"
                  value={foodType}
                  onChange={(e) => setFoodType(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Sorte wählen …</option>
                  {typeOptions.map((t) => {
                    const stock = pantry.find(p => p.type === t)
                    return (
                      <option key={t} value={t}>
                        {t}{stock ? ` (${stock.quantity} Dose${stock.quantity !== 1 ? 'n' : ''})` : ''}
                      </option>
                    )
                  })}
                </select>
              ) : (
                <input
                  id="foodType"
                  type="text"
                  value={foodType}
                  onChange={(e) => setFoodType(e.target.value)}
                  className="input-field"
                  placeholder="z.B. Nassfutter Huhn"
                  required
                />
              )}
            </div>

            {/* Menge */}
            <div>
              <label htmlFor="amountGrams" className="label">
                Menge in Gramm <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="amountGrams"
                type="number"
                min="1"
                max="999"
                value={amountGrams}
                onChange={(e) => setAmountGrams(e.target.value)}
                className="input-field"
                placeholder="z.B. 800"
              />
            </div>

            {/* Uhrzeit */}
            <div>
              <label htmlFor="loggedAt" className="label">Uhrzeit *</label>
              <input
                id="loggedAt"
                type="datetime-local"
                value={loggedAt}
                onChange={(e) => setLoggedAt(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <hr className="border-gray-100" />

            {/* Leckerli */}
            <MengeSlider
              label="ðŸ– Leckerli"
              value={treatAmount}
              onChange={setTreatAmount}
            />

            {/* Trockenfutter */}
            <MengeSlider
              label="ðŸ¥£ Trockenfutter"
              value={dryFoodAmount}
              onChange={setDryFoodAmount}
            />

            {/* Sonstiges */}
            <div>
              <label htmlFor="extras" className="label">
                Sonstiges bekommen <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="extras"
                type="text"
                value={extras}
                onChange={(e) => setExtras(e.target.value)}
                className="input-field"
                placeholder="z.B. Thunfisch, Hühnchen gekocht …"
              />
            </div>

            {/* Notiz */}
            <div>
              <label htmlFor="notes" className="label">
                Notiz <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-field resize-none"
                rows={2}
                placeholder="z.B. hat alles aufgefressen"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Link href="/dashboard" className="btn-secondary text-center">
                Abbrechen
              </Link>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

export default function NewFeedingPage() {
  return (
    <Suspense>
      <NewFeedingForm />
    </Suspense>
  )
}

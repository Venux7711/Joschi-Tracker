'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { toLocalISOString } from '@/lib/utils'

export default function NewFeedingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [catId, setCatId] = useState<string | null>(null)
  const [foodBrand, setFoodBrand] = useState('')
  const [foodType, setFoodType] = useState('')
  const [amountGrams, setAmountGrams] = useState('')
  const [loggedAt, setLoggedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prevBrands, setPrevBrands] = useState<string[]>([])
  const [prevTypes, setPrevTypes] = useState<string[]>([])

  useEffect(() => {
    setLoggedAt(toLocalISOString())

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: cats } = await supabase
        .from('cats')
        .select('id')
        .eq('owner_id', user.id)
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
    }

    init()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!catId) {
      setError('Katze nicht gefunden. Bitte zuerst das Dashboard öffnen.')
      return
    }
    setLoading(true)
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error: insertError } = await supabase.from('feeding_logs').insert({
      cat_id: catId,
      user_id: user.id,
      logged_at: new Date(loggedAt).toISOString(),
      food_brand: foodBrand.trim(),
      food_type: foodType.trim(),
      amount_grams: amountGrams ? parseInt(amountGrams, 10) : null,
      notes: notes.trim() || null,
    })

    if (insertError) {
      setError('Fehler beim Speichern. Bitte erneut versuchen.')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-amber-50">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Zurück
          </Link>
          <h1 className="text-xl font-bold text-gray-800">🍽️ Futter eintragen</h1>
        </div>

        <div className="card p-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Marke */}
            <div>
              <label htmlFor="foodBrand" className="label">
                Marke *
              </label>
              <input
                id="foodBrand"
                type="text"
                list="brands-list"
                value={foodBrand}
                onChange={(e) => setFoodBrand(e.target.value)}
                className="input-field"
                placeholder="z.B. Royal Canin"
                required
              />
              <datalist id="brands-list">
                {prevBrands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            {/* Sorte */}
            <div>
              <label htmlFor="foodType" className="label">
                Sorte *
              </label>
              <input
                id="foodType"
                type="text"
                list="types-list"
                value={foodType}
                onChange={(e) => setFoodType(e.target.value)}
                className="input-field"
                placeholder="z.B. Nassfutter Huhn"
                required
              />
              <datalist id="types-list">
                {prevTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
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
                placeholder="z.B. 85"
              />
            </div>

            {/* Uhrzeit */}
            <div>
              <label htmlFor="loggedAt" className="label">
                Uhrzeit *
              </label>
              <input
                id="loggedAt"
                type="datetime-local"
                value={loggedAt}
                onChange={(e) => setLoggedAt(e.target.value)}
                className="input-field"
                required
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
                rows={3}
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

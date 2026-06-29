'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import { ANIFIT_FOODS, getFoodInfo, getProteinLabel, getProteinBadgeColor } from '@/lib/food-data'
import type { PantryItem, NutritionData } from '@/lib/types'

type AddMode = 'anifit' | 'other'

function RestockLabel({ date }: { date: string | null }) {
  if (!date) return null
  const d = new Date(date)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return <span className="text-xs text-gray-400">Nachschub überfällig</span>
  if (diff === 0) return <span className="text-xs text-green-600 font-medium">Nachschub heute</span>
  if (diff <= 3) return <span className="text-xs text-amber-600">Nachschub in {diff} Tag{diff > 1 ? 'en' : ''}</span>
  return <span className="text-xs text-gray-400">Nachschub {d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span>
}

function NutritionBar({ nutrition }: { nutrition: NutritionData }) {
  const { protein, fat, fiber, moisture, ash } = nutrition
  const hasMacros = protein !== undefined || fat !== undefined || moisture !== undefined

  if (!hasMacros) return null

  return (
    <div className="mt-1.5 space-y-0.5">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
        {protein !== undefined && <span><span className="font-medium text-blue-600">{protein}%</span> Protein</span>}
        {fat !== undefined && <span><span className="font-medium text-amber-600">{fat}%</span> Fett</span>}
        {fiber !== undefined && <span><span className="font-medium text-green-600">{fiber}%</span> Faser</span>}
        {moisture !== undefined && <span><span className="font-medium text-gray-500">{moisture}%</span> Feuchte</span>}
        {ash !== undefined && <span><span className="font-medium text-gray-400">{ash}%</span> Asche</span>}
      </div>
      {(nutrition.taurine !== undefined || nutrition.calcium !== undefined) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
          {nutrition.taurine !== undefined && <span>Taurin {nutrition.taurine}mg/kg</span>}
          {nutrition.calcium !== undefined && <span>Ca {nutrition.calcium}g/kg</span>}
          {nutrition.phosphorus !== undefined && <span>P {nutrition.phosphorus}g/kg</span>}
          {nutrition.sodium !== undefined && <span>Na {nutrition.sodium}g/kg</span>}
          {nutrition.magnesium !== undefined && <span>Mg {nutrition.magnesium}g/kg</span>}
        </div>
      )}
    </div>
  )
}

function NutritionFields({
  value,
  onChange,
}: {
  value: NutritionData
  onChange: (v: NutritionData) => void
}) {
  const field = (
    key: keyof NutritionData,
    label: string,
    unit: string,
    placeholder: string
  ) => (
    <div>
      <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          step="0.1"
          value={value[key] ?? ''}
          onChange={e => onChange({ ...value, [key]: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
          placeholder={placeholder}
        />
        <span className="text-xs text-gray-400 whitespace-nowrap">{unit}</span>
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Analytische Bestandteile</p>
      <div className="grid grid-cols-2 gap-2">
        {field('protein', 'Rohprotein', '%', '10.5')}
        {field('fat', 'Rohfett', '%', '5.0')}
        {field('fiber', 'Rohfaser', '%', '0.5')}
        {field('moisture', 'Feuchtigkeit', '%', '79.0')}
        {field('ash', 'Rohasche', '%', '2.0')}
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Mikronährstoffe (optional)</p>
      <div className="grid grid-cols-2 gap-2">
        {field('taurine', 'Taurin', 'mg/kg', '1000')}
        {field('calcium', 'Calcium', 'g/kg', '2.5')}
        {field('phosphorus', 'Phosphor', 'g/kg', '2.0')}
        {field('sodium', 'Natrium', 'g/kg', '0.8')}
        {field('magnesium', 'Magnesium', 'g/kg', '0.15')}
      </div>
    </div>
  )
}

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  // Modal shared state
  const [addMode, setAddMode] = useState<AddMode>('anifit')
  const [addQty, setAddQty] = useState(1)
  const [addRestock, setAddRestock] = useState('')
  const [saving, setSaving] = useState(false)

  // Anifit mode
  const [addType, setAddType] = useState('')

  // Other mode
  const [otherBrand, setOtherBrand] = useState('')
  const [otherType, setOtherType] = useState('')
  const [otherUrl, setOtherUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  const [scrapeOk, setScrapeOk] = useState(false)
  const [nutrition, setNutrition] = useState<NutritionData>({})
  const [showNutrition, setShowNutrition] = useState(false)

  // Restock edit
  const [editRestockId, setEditRestockId] = useState<string | null>(null)
  const [editRestockDate, setEditRestockDate] = useState('')

  useEffect(() => {
    fetch('/api/pantry').then(r => r.json()).then(d => {
      setItems(d.items ?? [])
      setLoading(false)
    })
  }, [])

  const updateQty = async (id: string, delta: number) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    const newQty = Math.max(0, item.quantity + delta)
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: newQty } : i))
    await fetch('/api/pantry', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, quantity: newQty }),
    })
  }

  const deleteItem = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    await fetch('/api/pantry', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  const saveRestock = async (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, restock_date: editRestockDate || null } : i))
    await fetch('/api/pantry', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, restock_date: editRestockDate || null }),
    })
    setEditRestockId(null)
  }

  const scrapeUrl = async () => {
    if (!otherUrl.trim()) return
    setScraping(true)
    setScrapeError(null)
    setScrapeOk(false)

    try {
      const res = await fetch('/api/scrape-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: otherUrl.trim() }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setScrapeError(data.error ?? 'Laden fehlgeschlagen')
        return
      }

      if (data.nutrition) {
        setNutrition(data.nutrition)
        setShowNutrition(true)
        setScrapeOk(true)
      } else {
        setScrapeError('Keine Nährwertdaten auf der Seite gefunden – bitte manuell eingeben')
        setShowNutrition(true)
      }
    } catch {
      setScrapeError('Verbindung fehlgeschlagen')
    } finally {
      setScraping(false)
    }
  }

  const addItem = async () => {
    const brand = addMode === 'anifit' ? 'Anifit' : otherBrand.trim()
    const type = addMode === 'anifit' ? addType : otherType.trim()
    if (!brand || !type) return

    setSaving(true)

    const body: Record<string, unknown> = {
      brand,
      type,
      quantity: addQty,
      restock_date: addRestock || null,
    }

    if (addMode === 'other') {
      if (otherUrl.trim()) body.product_url = otherUrl.trim()
      const hasNutrition = Object.keys(nutrition).some(k => (nutrition as Record<string, unknown>)[k] !== undefined)
      if (hasNutrition) body.nutrition = nutrition
    }

    const res = await fetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.item) setItems(prev => [...prev, data.item])
    closeModal()
    setSaving(false)
  }

  const closeModal = () => {
    setShowAdd(false)
    setAddType('')
    setAddQty(1)
    setAddRestock('')
    setOtherBrand('')
    setOtherType('')
    setOtherUrl('')
    setScrapeError(null)
    setScrapeOk(false)
    setNutrition({})
    setShowNutrition(false)
    setAddMode('anifit')
  }

  const existingKeys = new Set(items.map(i => `${i.brand}||${i.type}`))
  const availableToAdd = ANIFIT_FOODS.filter(f => !existingKeys.has(`${f.brand}||${f.type}`))

  const inStock = items.filter(i => i.quantity > 0)
  const outOfStock = items.filter(i => i.quantity === 0)

  const canAdd = addMode === 'anifit' ? !!addType : (!!otherBrand.trim() && !!otherType.trim())

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-8">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Vorrat</h1>
            <p className="text-xs text-gray-400 mt-0.5">Was ist aktuell im Haus?</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded-xl transition-colors"
          >
            + Hinzufügen
          </button>
        </div>

        {loading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100" />)}
          </div>
        )}

        {!loading && inStock.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            <p className="text-gray-400 text-sm">Noch kein Futter im Vorrat</p>
            <p className="text-gray-300 text-xs mt-1">Tippe auf "+ Hinzufügen" um anzufangen</p>
          </div>
        )}

        {/* Im Vorrat */}
        {inStock.length > 0 && (
          <div className="space-y-2">
            {inStock.map(item => {
              const info = getFoodInfo(item.brand, item.type)
              return (
                <div key={item.id} className="card overflow-hidden">
                  <div className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{item.type || item.brand}</span>
                        {item.brand !== 'Anifit' && (
                          <span className="text-[10px] text-gray-400 font-medium">{item.brand}</span>
                        )}
                        {info && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getProteinBadgeColor(info)}`}>
                            {getProteinLabel(info)}
                          </span>
                        )}
                        {item.product_url && (
                          <a
                            href={item.product_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-500 hover:underline"
                          >
                            🔗 Produktseite
                          </a>
                        )}
                      </div>
                      {info?.notes && (
                        <p className="text-xs text-gray-400 mt-0.5">{info.notes}</p>
                      )}
                      {item.nutrition && <NutritionBar nutrition={item.nutrition} />}
                      <div className="flex items-center gap-2 mt-1">
                        {editRestockId === item.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="date"
                              value={editRestockDate}
                              onChange={e => setEditRestockDate(e.target.value)}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                            />
                            <button onClick={() => saveRestock(item.id)} className="text-xs text-amber-600 font-medium">OK</button>
                            <button onClick={() => setEditRestockId(null)} className="text-xs text-gray-400">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditRestockId(item.id); setEditRestockDate(item.restock_date ?? '') }}
                            className="flex items-center gap-1"
                          >
                            {item.restock_date
                              ? <RestockLabel date={item.restock_date} />
                              : <span className="text-xs text-gray-300 hover:text-gray-400">+ Nachschub-Datum</span>
                            }
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Menge stepper */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => updateQty(item.id, -1)}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-lg font-medium flex items-center justify-center leading-none"
                      >
                        −
                      </button>
                      <span className="text-sm font-bold text-gray-800 w-5 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.id, +1)}
                        className="w-8 h-8 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-700 text-lg font-medium flex items-center justify-center leading-none"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Leer / aufgebraucht */}
        {outOfStock.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-2">Aufgebraucht</p>
            <div className="space-y-2">
              {outOfStock.map(item => (
                <div key={item.id} className="bg-white rounded-2xl border border-gray-100 opacity-50 overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-500 line-through">{item.type || item.brand}</p>
                      {item.brand !== 'Anifit' && (
                        <p className="text-xs text-gray-400">{item.brand}</p>
                      )}
                      <RestockLabel date={item.restock_date} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQty(item.id, +1)}
                        className="text-xs text-amber-600 font-medium bg-amber-50 px-3 py-1.5 rounded-lg"
                      >
                        Nachgefüllt
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="text-xs text-gray-300 hover:text-red-400 transition-colors px-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-lg font-bold text-gray-800 mb-3">Futter hinzufügen</h2>

              {/* Mode Tabs */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setAddMode('anifit')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${addMode === 'anifit' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500'}`}
                >
                  🐱 Anifit
                </button>
                <button
                  onClick={() => setAddMode('other')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${addMode === 'other' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500'}`}
                >
                  🏪 Andere Marke
                </button>
              </div>
            </div>

            <div className="px-5 py-3 space-y-4">

              {/* ── ANIFIT MODE ── */}
              {addMode === 'anifit' && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Anifit-Sorte wählen</label>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {availableToAdd.map(f => (
                      <button
                        key={f.type}
                        onClick={() => setAddType(f.type)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                          addType === f.type
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-800">{f.type}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getProteinBadgeColor(f)}`}>
                            {f.proteinType === 'mono' ? 'Mono' : 'Multi'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">{f.proteins.join(' + ')}</p>
                      </button>
                    ))}
                    {availableToAdd.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">Alle Anifit-Sorten bereits im Vorrat</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── ANDERE MARKE MODE ── */}
              {addMode === 'other' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Hersteller *</label>
                    <input
                      type="text"
                      value={otherBrand}
                      onChange={e => setOtherBrand(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                      placeholder="z.B. Zooplus, Animonda, Almo Nature …"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Produkt / Sorte *</label>
                    <input
                      type="text"
                      value={otherType}
                      onChange={e => setOtherType(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                      placeholder="z.B. Carny Kitten Huhn & Truthahn"
                    />
                  </div>

                  {/* URL Scraping */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      Produktseite URL <span className="font-normal text-gray-400 normal-case">(optional – Nährwerte automatisch laden)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={otherUrl}
                        onChange={e => { setOtherUrl(e.target.value); setScrapeOk(false); setScrapeError(null) }}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                        placeholder="https://..."
                      />
                      <button
                        type="button"
                        onClick={scrapeUrl}
                        disabled={!otherUrl.trim() || scraping}
                        className="px-3 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        {scraping ? '⏳' : scrapeOk ? '✅' : '🔍 Laden'}
                      </button>
                    </div>
                    {scrapeError && (
                      <p className="text-xs text-red-500 mt-1.5">{scrapeError}</p>
                    )}
                    {scrapeOk && (
                      <p className="text-xs text-green-600 mt-1.5">Nährwerte geladen – bitte prüfen und anpassen</p>
                    )}
                  </div>

                  {/* Nährwerte manuell / toggle */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowNutrition(v => !v)}
                      className="text-xs text-blue-500 hover:underline"
                    >
                      {showNutrition ? '▲ Nährwerte ausblenden' : '▼ Nährwerte manuell eingeben'}
                    </button>
                    {showNutrition && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                        <NutritionFields value={nutrition} onChange={setNutrition} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── SHARED: Quantity + Restock ── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Anzahl Dosen</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setAddQty(q => Math.max(1, q - 1))} className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 text-xl font-medium flex items-center justify-center">−</button>
                  <span className="text-2xl font-bold text-gray-800 w-8 text-center">{addQty}</span>
                  <button onClick={() => setAddQty(q => q + 1)} className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 text-xl font-medium flex items-center justify-center">+</button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Nachschub erwartet am</label>
                <input
                  type="date"
                  value={addRestock}
                  onChange={e => setAddRestock(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-2">
              <button onClick={closeModal} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">
                Abbrechen
              </button>
              <button
                onClick={addItem}
                disabled={!canAdd || saving}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-40 hover:bg-amber-600 transition-colors"
              >
                {saving ? 'Speichern…' : 'Hinzufügen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

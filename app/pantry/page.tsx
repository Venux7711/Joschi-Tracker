'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import { ANIFIT_FOODS, getFoodInfo, getProteinLabel, getProteinBadgeColor } from '@/lib/food-data'
import type { PantryItem } from '@/lib/types'

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

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addBrand, setAddBrand] = useState('Anifit')
  const [addType, setAddType] = useState('')
  const [addQty, setAddQty] = useState(1)
  const [addRestock, setAddRestock] = useState('')
  const [saving, setSaving] = useState(false)
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

  const addItem = async () => {
    if (!addType) return
    setSaving(true)
    const res = await fetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: addBrand, type: addType, quantity: addQty, restock_date: addRestock || null }),
    })
    const data = await res.json()
    if (data.item) setItems(prev => [...prev, data.item])
    setShowAdd(false)
    setAddType('')
    setAddQty(1)
    setAddRestock('')
    setSaving(false)
  }

  // Anifit-Sorten die noch nicht im Vorrat sind
  const existingKeys = new Set(items.map(i => `${i.brand}||${i.type}`))
  const availableToAdd = ANIFIT_FOODS.filter(f => !existingKeys.has(`${f.brand}||${f.type}`))

  const inStock = items.filter(i => i.quantity > 0)
  const outOfStock = items.filter(i => i.quantity === 0)

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
                        {info && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getProteinBadgeColor(info)}`}>
                            {getProteinLabel(info)}
                          </span>
                        )}
                      </div>
                      {info?.notes && (
                        <p className="text-xs text-gray-400 mt-0.5">{info.notes}</p>
                      )}
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
                            <button onClick={() => setEditRestockId(null)} className="text-xs text-gray-400">âœ•</button>
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
                        âˆ’
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
                        âœ•
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-2">
              <h2 className="text-lg font-bold text-gray-800">Futter hinzufügen</h2>
            </div>

            <div className="px-5 py-3 space-y-4">
              {/* Sorte wählen aus nicht-vorhandenen Anifit-Sorten */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Anifit-Sorte</label>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {availableToAdd.map(f => (
                    <button
                      key={f.type}
                      onClick={() => { setAddBrand(f.brand); setAddType(f.type) }}
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

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Anzahl Dosen</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setAddQty(q => Math.max(1, q - 1))} className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 text-xl font-medium flex items-center justify-center">âˆ’</button>
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
              <button onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">
                Abbrechen
              </button>
              <button
                onClick={addItem}
                disabled={!addType || saving}
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

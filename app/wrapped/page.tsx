'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface WrappedStats {
  year: string
  totalFeedings: number
  topFood: string
  topFoodCount: number
  totalGrams: number
  proteins: string[]
  longestStreak: number
  goodDaysPercent: number
  goodDays: number
  totalDays: number
  bestMonth: string
  totalEntries: number
  totalHealthEntries: number
}

interface Slide {
  bg: string
  emoji: string
  title?: string
  subtitle?: string
  big?: string | number
  label?: string
  sublabel?: string
  isIntro?: boolean
  isOutro?: boolean
}

function AnimatedNumber({ target }: { target: number }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let start = 0
    const step = Math.ceil(target / 40)
    const timer = setInterval(() => {
      start = Math.min(start + step, target)
      setVal(start)
      if (start >= target) clearInterval(timer)
    }, 30)
    return () => clearInterval(timer)
  }, [target])
  return <>{val.toLocaleString('de-DE')}</>
}

export default function WrappedPage() {
  const [stats, setStats] = useState<WrappedStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const [visible, setVisible] = useState(true)
  const [year, setYear] = useState(String(new Date().getFullYear()))

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 3 }, (_, i) => String(currentYear - i)).reverse()

  useEffect(() => {
    setLoading(true)
    fetch(`/api/wrapped?year=${year}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); setCurrent(0) })
  }, [year])

  const getSlides = (s: WrappedStats): Slide[] => [
    {
      bg: 'from-amber-400 via-orange-500 to-red-500',
      emoji: '🐾',
      title: `Joscis Jahr ${s.year}`,
      subtitle: 'Deine persönliche Jahresrückschau',
      isIntro: true,
    },
    {
      bg: 'from-violet-500 via-purple-600 to-indigo-700',
      emoji: '🍽️',
      big: s.totalFeedings,
      label: 'Fütterungen',
      sublabel: 'so oft hast du für Joschi gesorgt',
    },
    {
      bg: 'from-emerald-400 via-teal-500 to-cyan-600',
      emoji: '⭐',
      big: s.topFood.split('(')[0].trim(),
      label: `${s.topFoodCount}× dein Lieblingsfutter`,
      sublabel: 'Joschis absoluter Favorit',
    },
    {
      bg: 'from-sky-400 via-blue-500 to-blue-700',
      emoji: '💪',
      big: s.longestStreak,
      label: 'Tage kein Durchfall',
      sublabel: 'deine längste Glückssträhne in Folge',
    },
    {
      bg: 'from-rose-400 via-pink-500 to-fuchsia-600',
      emoji: '🌡️',
      big: `${s.goodDaysPercent}%`,
      label: 'gute Tage',
      sublabel: `${s.goodDays} von ${s.totalDays} Tagen bestes Wohlbefinden`,
    },
    {
      bg: 'from-orange-400 via-amber-500 to-yellow-500',
      emoji: '🔬',
      big: s.proteins.length,
      label: 'verschiedene Proteinquellen',
      sublabel: s.proteins.slice(0, 6).join(' · '),
    },
    {
      bg: 'from-indigo-400 via-blue-500 to-cyan-500',
      emoji: '📊',
      big: s.totalGrams >= 1000 ? `${(s.totalGrams / 1000).toFixed(1)} kg` : `${s.totalGrams} g`,
      label: 'Futter insgesamt',
      sublabel: 'gutes Essen für eine besondere Katze',
    },
    {
      bg: 'from-green-400 via-emerald-500 to-teal-600',
      emoji: '🏆',
      big: s.bestMonth,
      label: 'war dein bester Monat',
      sublabel: 'die wenigsten Durchfall-Episoden',
    },
    {
      bg: 'from-pink-400 via-rose-500 to-red-500',
      emoji: '❤️',
      title: 'Danke für deine Fürsorge',
      subtitle: `${s.totalEntries} Einträge – Joschi ist in den besten Händen`,
      isOutro: true,
    },
  ]

  const goTo = (idx: number) => {
    setVisible(false)
    setTimeout(() => { setCurrent(idx); setVisible(true) }, 250)
  }

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
      <div className="text-white text-center">
        <div className="text-6xl mb-4 animate-bounce">🐾</div>
        <p className="text-xl font-bold">Joschis Jahr wird analysiert…</p>
      </div>
    </div>
  )

  if (!stats || stats.totalFeedings === 0) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-400 to-orange-600 flex flex-col items-center justify-center p-6 text-white text-center">
      <div className="text-6xl mb-6">😿</div>
      <h1 className="text-2xl font-bold mb-3">Noch nicht genug Daten</h1>
      <p className="text-white/80 mb-8">Für {year} sind noch keine Fütterungsdaten vorhanden</p>
      <Link href="/dashboard" className="bg-white text-amber-600 font-bold px-6 py-3 rounded-2xl">Zum Dashboard</Link>
    </div>
  )

  const slides = getSlides(stats)
  const slide = slides[current]

  return (
    <div className={`min-h-screen bg-gradient-to-br ${slide.bg} transition-all duration-500`}>
      {/* Year selector */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        {years.map(y => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`px-3 py-1 rounded-full text-sm font-bold transition-colors ${year === y ? 'bg-white text-gray-800' : 'bg-white/20 text-white hover:bg-white/30'}`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Back button */}
      <Link href="/dashboard" className="absolute top-4 right-4 z-10 bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-full text-sm font-medium transition-colors">
        ← Zurück
      </Link>

      {/* Slide content */}
      <div
        className="min-h-screen flex flex-col items-center justify-center p-8 text-center text-white cursor-pointer select-none"
        onClick={() => current < slides.length - 1 ? goTo(current + 1) : goTo(0)}
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.25s, transform 0.25s' }}
      >
        {slide.isIntro ? (
          <>
            <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-white/50 mb-6 shadow-2xl">
              <Image src="/joschi.jpg" alt="Joschi" fill className="object-cover object-top" />
            </div>
            <div className="text-7xl mb-4">{slide.emoji}</div>
            <h1 className="text-4xl font-black mb-3 leading-tight">{slide.title}</h1>
            <p className="text-white/80 text-lg">{slide.subtitle}</p>
            <p className="text-white/50 text-sm mt-8 animate-pulse">Tippen zum Starten</p>
          </>
        ) : slide.isOutro ? (
          <>
            <div className="text-8xl mb-6">{slide.emoji}</div>
            <h1 className="text-3xl font-black mb-4 leading-tight">{slide.title}</h1>
            <p className="text-white/80 text-lg">{slide.subtitle}</p>
            <div className="mt-10">
              <Link
                href="/dashboard"
                onClick={e => e.stopPropagation()}
                className="bg-white text-gray-800 font-bold px-8 py-3 rounded-2xl text-lg hover:scale-105 transition-transform inline-block"
              >
                Zum Dashboard
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="text-6xl mb-6">{slide.emoji}</div>
            <div className="text-7xl sm:text-8xl font-black mb-3 leading-none tracking-tight">
              {typeof slide.big === 'number'
                ? <AnimatedNumber target={slide.big} />
                : slide.big}
            </div>
            <p className="text-2xl font-bold mb-2">{slide.label}</p>
            {slide.sublabel && <p className="text-white/70 text-base mt-1 max-w-xs">{slide.sublabel}</p>}
          </>
        )}
      </div>

      {/* Progress dots */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`rounded-full transition-all ${i === current ? 'bg-white w-6 h-2' : 'bg-white/40 w-2 h-2'}`}
          />
        ))}
      </div>
    </div>
  )
}

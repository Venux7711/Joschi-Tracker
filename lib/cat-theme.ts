import type { CatTheme } from './types'

// Ein Theme pro Katze: Akzentfarbe für Tabs/Buttons + der Hero-Karten-Verlauf
// auf dem Dashboard. "silver" ist bewusst hell/glänzend gehalten (Bellas
// Silver-Tabby-Fell), nicht einfach ein generisches Grau.
export const CAT_THEMES: Record<CatTheme, {
  accent: string
  accentTint: string
  heroGradient: string
  heroGlow: string
  heroAccent: string
  heroAccentSoft: string
  heroAccentBright: string
  photoGradient: string
  hasSheen: boolean
}> = {
  amber: {
    accent: '#D97706',
    accentTint: 'rgba(217,119,6,0.08)',
    heroGradient: 'linear-gradient(140deg, #1C1C1E 0%, #2D1500 55%, #78350F 100%)',
    heroGlow: 'radial-gradient(ellipse at 70% 0%, rgba(251,191,36,0.12) 0%, transparent 60%)',
    heroAccent: '#FBBF24',
    heroAccentSoft: 'rgba(251,191,36,0.7)',
    heroAccentBright: '#FDE68A',
    photoGradient: 'linear-gradient(135deg, #FBBF24, #92400E)',
    hasSheen: false,
  },
  silver: {
    accent: '#55636D',
    accentTint: 'rgba(85,99,109,0.09)',
    heroGradient: 'linear-gradient(135deg, #14181C 0%, #20262B 26%, #8B97A1 64%, #EEF1F3 128%)',
    heroGlow: 'radial-gradient(ellipse at 75% -10%, rgba(255,255,255,0.22) 0%, transparent 55%)',
    heroAccent: '#EEF1F3',
    heroAccentSoft: 'rgba(238,241,243,0.75)',
    heroAccentBright: '#FFFFFF',
    photoGradient: 'linear-gradient(135deg, #EEF1F3, #55636D)',
    hasSheen: true,
  },
}

export function getCatTheme(theme: CatTheme) {
  return CAT_THEMES[theme] ?? CAT_THEMES.amber
}

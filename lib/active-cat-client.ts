// Client-seitiges Gegenstück zu active-cat.server.ts. Nutzt dasselbe Cookie
// ("active_cat_id"), damit Server- und Client-Komponenten dieselbe aktive
// Katze sehen, ohne einen zusätzlichen API-Roundtrip zu brauchen.
const ACTIVE_CAT_COOKIE = 'active_cat_id'
// Zweites Cookie für das Theme der aktiven Katze, damit das Root-Layout
// (Server) die App-Farbe ohne DB-Roundtrip setzen kann.
const ACTIVE_CAT_THEME_COOKIE = 'active_cat_theme'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

export function getActiveCatIdClient(): string | null {
  return readCookie(ACTIVE_CAT_COOKIE)
}

export function setActiveCatIdClient(catId: string) {
  writeCookie(ACTIVE_CAT_COOKIE, catId)
}

export function getActiveCatThemeClient(): string | null {
  return readCookie(ACTIVE_CAT_THEME_COOKIE)
}

export function setActiveCatThemeClient(theme: string) {
  writeCookie(ACTIVE_CAT_THEME_COOKIE, theme)
}

// Wählt aus einer Liste geladener Katzen die aktive aus (Cookie-Wert, sonst die erste).
export function pickActiveCat<T extends { id: string }>(cats: T[]): T | undefined {
  if (cats.length === 0) return undefined
  const stored = getActiveCatIdClient()
  return cats.find((c) => c.id === stored) ?? cats[0]
}

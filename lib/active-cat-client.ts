// Client-seitiges Gegenstück zu active-cat.server.ts. Nutzt dasselbe Cookie
// ("active_cat_id"), damit Server- und Client-Komponenten dieselbe aktive
// Katze sehen, ohne einen zusätzlichen API-Roundtrip zu brauchen.
const ACTIVE_CAT_COOKIE = 'active_cat_id'

export function getActiveCatIdClient(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_CAT_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function setActiveCatIdClient(catId: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${ACTIVE_CAT_COOKIE}=${encodeURIComponent(catId)}; path=/; max-age=31536000; samesite=lax`
}

// Wählt aus einer Liste geladener Katzen die aktive aus (Cookie-Wert, sonst die erste).
export function pickActiveCat<T extends { id: string }>(cats: T[]): T | undefined {
  if (cats.length === 0) return undefined
  const stored = getActiveCatIdClient()
  return cats.find((c) => c.id === stored) ?? cats[0]
}

import { cookies } from 'next/headers'
import type { createClient } from './supabase/server'
import type { Cat } from './types'

export const ACTIVE_CAT_COOKIE = 'active_cat_id'

export async function getCats(supabase: ReturnType<typeof createClient>): Promise<Cat[]> {
  const { data } = await supabase.from('cats').select('*').order('created_at', { ascending: true })
  return (data ?? []) as Cat[]
}

// Liest die vom Nutzer gewählte Katze aus dem Cookie (vom CatSwitcher gesetzt).
// Fällt auf die zuerst angelegte Katze zurück, falls kein/ein ungültiges Cookie vorliegt.
export async function getActiveCat(supabase: ReturnType<typeof createClient>): Promise<Cat | undefined> {
  const cats = await getCats(supabase)
  if (cats.length === 0) return undefined
  const activeCatId = cookies().get(ACTIVE_CAT_COOKIE)?.value
  return cats.find((c) => c.id === activeCatId) ?? cats[0]
}

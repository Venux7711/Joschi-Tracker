import type { SupabaseClient } from '@supabase/supabase-js'

export type PantryLike = { id: string; brand: string; type: string; quantity: number }

/**
 * Eine Dose gilt als verbraucht, sobald auf eine andere Sorte gewechselt wird –
 * bis dahin wird aus derselben Dose weitergefüttert.
 *
 * Wird nach dem Speichern einer Fütterung aufgerufen: Gab es davor eine andere
 * Sorte, war deren Dose damit leer und wird im Vorrat um eins reduziert.
 *
 * Gesucht wird gezielt der zeitlich davorliegende Eintrag (nicht einfach der
 * zweitneueste), damit auch nachgetragene Fütterungen richtig einsortiert
 * werden – nachgetragen wird hier häufiger als live erfasst.
 */
export async function consumePreviousCan(
  supabase: SupabaseClient,
  opts: {
    /** Eine der gefütterten Katzen genügt – der Vorrat ist Haushalts-Sache */
    catId: string
    /** Zeitpunkt der gerade gespeicherten Fütterung */
    loggedAt: string
    newBrand: string
    newType: string
    pantry: PantryLike[]
  },
): Promise<void> {
  const { catId, loggedAt, newBrand, newType, pantry } = opts

  const { data: previous } = await supabase
    .from('feeding_logs')
    .select('food_brand, food_type')
    .eq('cat_id', catId)
    .lt('logged_at', loggedAt)
    .order('logged_at', { ascending: false })
    .limit(1)

  const prev = previous?.[0]
  if (!prev?.food_type) return

  const sameSort =
    prev.food_type.trim().toLowerCase() === newType.trim().toLowerCase() &&
    (prev.food_brand ?? '').trim().toLowerCase() === newBrand.trim().toLowerCase()
  if (sameSort) return

  // Marke bewusst mitverglichen, aber nicht als Bedingung: Auch der Wechsel auf
  // eine andere Marke bedeutet, dass die vorherige Dose aufgebraucht ist.
  const prevItem = pantry.find(
    (p) =>
      p.type.trim().toLowerCase() === prev.food_type.trim().toLowerCase() &&
      p.brand.trim().toLowerCase() === (prev.food_brand ?? '').trim().toLowerCase() &&
      p.quantity > 0,
  )
  if (!prevItem) return

  await fetch('/api/pantry', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: prevItem.id, quantity: prevItem.quantity - 1 }),
  })
}

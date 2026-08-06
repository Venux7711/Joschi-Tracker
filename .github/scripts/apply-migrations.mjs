// Wendet ausstehende SQL-Migrationen aus supabase/migrations/ auf die
// Supabase-Datenbank an – über die Management-API (kein DB-Passwort nötig,
// nur ein Personal Access Token). Welche Migrationen schon liefen, steht in
// der Tabelle public._applied_migrations; es werden nur NEUE Dateien
// eingespielt. Läuft in der GitHub Action bei jedem Push auf main.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.PROJECT_REF

// Secret noch nicht hinterlegt → sauber überspringen (kein rotes X beim Setup),
// statt hart zu scheitern. Sobald SUPABASE_ACCESS_TOKEN als GitHub-Secret
// existiert, läuft die Migration echt durch.
if (!TOKEN) {
  console.log('⏭  SUPABASE_ACCESS_TOKEN ist nicht gesetzt – übersprungen.')
  console.log('   Secret in GitHub hinterlegen (Repo → Settings → Secrets → Actions),')
  console.log('   damit Migrationen bei jedem Push automatisch laufen.')
  process.exit(0)
}
if (!REF) {
  console.error('Fehlt: PROJECT_REF muss gesetzt sein (im Workflow hinterlegt).')
  process.exit(1)
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`
const MIG_DIR = 'supabase/migrations'

async function query(sql) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`)
  return text ? JSON.parse(text) : []
}

async function main() {
  // Tracking-Tabelle sicherstellen (idempotent). RLS an, keine Policies →
  // für die App unsichtbar; die Management-API (Admin) umgeht RLS.
  await query(
    `CREATE TABLE IF NOT EXISTS public._applied_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     );
     ALTER TABLE public._applied_migrations ENABLE ROW LEVEL SECURITY;`,
  )

  const appliedRows = await query('SELECT name FROM public._applied_migrations')
  const applied = new Set(appliedRows.map((r) => r.name))

  const files = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const pending = files.filter((f) => !applied.has(f))

  if (pending.length === 0) {
    console.log('✓ Keine ausstehenden Migrationen – Datenbank ist aktuell.')
    return
  }

  console.log(`${pending.length} ausstehende Migration(en): ${pending.join(', ')}`)
  for (const file of pending) {
    const sql = readFileSync(join(MIG_DIR, file), 'utf8')
    console.log(`→ wende an: ${file}`)
    await query(sql)
    // Dollar-Quoting, damit der Dateiname keine Quote-Probleme macht
    await query(
      `INSERT INTO public._applied_migrations (name) VALUES ($tag$${file}$tag$)
       ON CONFLICT (name) DO NOTHING;`,
    )
    console.log(`  ✓ ${file} angewendet und protokolliert`)
  }
  console.log('✓ Alle ausstehenden Migrationen angewendet.')
}

main().catch((err) => {
  console.error('✗ Migration fehlgeschlagen:', err.message)
  process.exit(1)
})

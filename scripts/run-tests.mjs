/**
 * Testlauf ohne zusätzliche Abhängigkeit.
 *
 * lib/time.ts und lib/birthday.ts sind reine Funktionen und zugleich die
 * fehleranfälligsten Stellen der App – Zeitzonen, Sommerzeit, Jahresgrenzen,
 * Schaltjahre. Beim Bauen sind hier bereits zwei echte Fehler aufgefallen.
 *
 * Nodes Test-Runner kann kein TypeScript mit erweiterungslosen Importen, also
 * werden die beiden Dateien vorher nach CommonJS übersetzt. Dort löst
 * require() ohne Dateiendung auf.
 */
import { execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, readdirSync } from 'node:fs'

const OUT = '.test-build'
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// Kein shell:true – das würde die Argumente unescaped zusammenkleben (DEP0190).
// Node direkt über execPath, npx unter Windows über die .cmd-Variante.
const run = (cmd, args, env) =>
  execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } })

// tsc direkt als JS-Datei starten statt über npx: Unter Windows bräuchte
// npx.cmd eine Shell, und die soll hier gerade vermieden werden.
const tsc = 'node_modules/typescript/bin/tsc'

run(process.execPath, [tsc, 'lib/time.ts', 'lib/birthday.ts', 'lib/media.ts', 'lib/geolocation.ts',
  'lib/video-compress.ts', 'lib/video-debug.ts', 'lib/reactions.ts', 'lib/thoughts.ts', 'lib/humor.ts', 'lib/photo-select.ts',
  // Das Gedächtnis: reine Funktionen, damit sich die Regeln prüfen lassen,
  // ohne einen Tag zu simulieren oder eine Datenbank anzufassen.
  'lib/memory/types.ts', 'lib/memory/merge.ts', 'lib/memory/select.ts', 'lib/memory/observe.ts',
  'lib/memory/backfill.ts',
  '--outDir', OUT, '--target', 'es2020', '--module', 'commonjs',
  // --strict wie in tsconfig.json: Ohne strictNullChecks grenzt TypeScript
  // unterschiedene Vereinigungstypen nicht ein, und der Testlauf scheiterte
  // an Code, den der echte Build anstandslos übersetzt.
  '--moduleResolution', 'node', '--skipLibCheck', '--strict'])

// Zeitzone bewusst auf UTC: So läuft der Test wie auf Vercel und nicht wie auf
// dem Rechner des Entwicklers – genau dieser Unterschied verbarg die Fehler.
try {
  // Dateien einzeln übergeben: Ein Ordnerpfad wird von Node als Modul gedeutet
  const files = readdirSync('test').filter(f => f.endsWith('.test.cjs')).map(f => `test/${f}`)
  run(process.execPath, ['--test', '--test-reporter', 'spec', ...files], { TZ: 'UTC' })
} finally {
  rmSync(OUT, { recursive: true, force: true })
}

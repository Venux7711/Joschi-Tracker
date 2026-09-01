-- Das Gedächtnis: was die App über Joschi und Bella weiß.
--
-- Abzugrenzen von ai_memories: Das sind Fakten und Anweisungen, die ein Mensch
-- dem Chat beigebracht hat. Hier steht, was die App aus den eigenen Daten
-- beobachtet hat – Plätze, wiederkehrende Gegenstände, Muster, erste Male.
-- Zwei verschiedene Quellen, zwei Tabellen. Ein Mensch soll später eine
-- beobachtete Erinnerung korrigieren können, deshalb steht die Quelle dabei.
--
-- Warum überhaupt gespeichert wird: Ein Satz wie "Ich sage nichts zum Karton"
-- ist für sich genommen bedeutungslos. Er wird erst zum Insider, wenn die App
-- weiß, dass der Karton seit Monaten immer wiederkehrt. Genau das steht hier.

CREATE TABLE IF NOT EXISTS cat_memories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Worüber? Eine Katze, beide zusammen, oder der Haushalt. Kein Fremdschlüssel
  -- auf cats: 'pair' und 'household' sind keine Katzen.
  subject_type  text NOT NULL,
  subject_id    uuid REFERENCES cats(id) ON DELETE CASCADE,

  memory_type   text NOT NULL,
  -- Der Kurzname, an dem wiedererkannt wird. Klein geschrieben und getrimmt,
  -- damit "Der Karton" und "der karton" dieselbe Erinnerung sind.
  title         text NOT NULL,
  description   text,

  -- Woher das kommt. Ohne Beleg wird nichts gespeichert: Fotos, an welchen
  -- Tagen es vorkam, wie oft. Das beantwortet "warum glaubt das System das?"
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_photo_ids uuid[] NOT NULL DEFAULT '{}',

  -- 0 bis 1. Steigt mit jeder Bestätigung, sinkt bei Widerspruch.
  confidence    real NOT NULL DEFAULT 0.25,
  occurrence_count integer NOT NULL DEFAULT 1,

  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),

  -- tentative: einmal gesehen, noch nichts wert.
  -- active: mehrfach bestätigt.
  -- stale: lange nicht mehr vorgekommen.
  -- superseded: durch eine neuere Erinnerung ersetzt.
  status        text NOT NULL DEFAULT 'tentative',

  -- 'beobachtung' oder 'nutzer'. Eine Korrektur durch einen Menschen wiegt
  -- schwerer als jede Modellinterpretation und darf davon nicht überschrieben
  -- werden.
  source        text NOT NULL DEFAULT 'beobachtung',

  related_memory_ids uuid[] NOT NULL DEFAULT '{}',

  -- Für spätere Fehlersuche und Neuerzeugung: womit wurde das erzeugt?
  model_version  text,
  prompt_version text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Dieselbe Sache soll nicht zweimal dastehen. Der Titel ist der Schlüssel,
  -- deshalb muss er normalisiert hineingeschrieben werden.
  --
  -- memory_type gehört ausdrücklich NICHT dazu: Die Art verändert sich mit der
  -- Zeit – aus einer Beobachtung wird ein Muster, daraus eine Vorliebe. Stünde
  -- sie im Schlüssel, entstünde bei jeder Beförderung eine zweite Zeile mit
  -- demselben Inhalt, und der Zähler finge wieder bei eins an.
  UNIQUE (subject_type, subject_id, title)
);

DO $$ BEGIN
  ALTER TABLE cat_memories ADD CONSTRAINT cat_memories_subject_check
    CHECK (subject_type IN ('cat', 'pair', 'household'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cat_memories ADD CONSTRAINT cat_memories_type_check
    CHECK (memory_type IN (
      'fact', 'observation', 'event', 'milestone', 'preference',
      'pattern', 'running_gag', 'relationship', 'temporal_pattern'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cat_memories ADD CONSTRAINT cat_memories_status_check
    CHECK (status IN ('tentative', 'active', 'stale', 'superseded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cat_memories ADD CONSTRAINT cat_memories_source_check
    CHECK (source IN ('beobachtung', 'nutzer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cat_memories ADD CONSTRAINT cat_memories_confidence_check
    CHECK (confidence >= 0 AND confidence <= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Die Auswahl fragt immer nach brauchbaren Erinnerungen, sortiert nach
-- Aktualität. Verbrauchtes und Ersetztes bleibt außen vor.
CREATE INDEX IF NOT EXISTS cat_memories_brauchbar_idx
  ON cat_memories (last_seen_at DESC)
  WHERE status IN ('active', 'tentative');

CREATE INDEX IF NOT EXISTS cat_memories_typ_idx ON cat_memories (memory_type, status);

ALTER TABLE cat_memories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Haushalt liest Gedaechtnis" ON cat_memories
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Tageszusammenfassung ────────────────────────────────────────────────
--
-- Was an einem Tag beobachtet wurde, in kompakter Form. Zweck: Die Rohdaten
-- müssen nicht bei jeder Auswertung erneut durchsucht und schon gar nicht
-- erneut an ein Modell geschickt werden. Ein Tag wird einmal angesehen und
-- danach nur noch in dieser Form gelesen.

CREATE TABLE IF NOT EXISTS cat_day_summaries (
  tag           date PRIMARY KEY,
  -- Die strukturierten Beobachtungen des Tages, wie sie aus Daten und
  -- Bildanalyse hervorgingen.
  observations  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Zahlen des Tages: Fütterungen, Fotos, beteiligte Katzen, Orte.
  kennzahlen    jsonb NOT NULL DEFAULT '{}'::jsonb,
  photo_count   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cat_day_summaries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Haushalt liest Tagesbilder" ON cat_day_summaries
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Verbindung zu den Gedanken ──────────────────────────────────────────
--
-- Welche Erinnerungen sind in einen Gedanken eingeflossen? Zwei Gründe: Ein
-- Running Gag darf nicht an drei Tagen hintereinander kommen, dafür muss die
-- Verwendung nachweisbar sein. Und später soll die Frage "warum sagt die App
-- das?" beantwortbar sein.

ALTER TABLE cat_thoughts ADD COLUMN IF NOT EXISTS used_memory_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE cat_thoughts ADD COLUMN IF NOT EXISTS model_version text;
ALTER TABLE cat_thoughts ADD COLUMN IF NOT EXISTS prompt_version text;

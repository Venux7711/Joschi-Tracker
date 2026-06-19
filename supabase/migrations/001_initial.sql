-- ============================================================
-- Joschi Tracker – Datenbank-Migration (idempotent)
-- Kann mehrfach ausgeführt werden ohne Fehler
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMS
DO $$ BEGIN
  CREATE TYPE stool_consistency AS ENUM ('normal', 'soft', 'diarrhea', 'not_observed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE appetite_level AS ENUM ('good', 'reduced', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_level AS ENUM ('normal', 'tired', 'very_active');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- TABELLE: cats
CREATE TABLE IF NOT EXISTS cats (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE cats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Eigene Katzen lesen" ON cats FOR SELECT USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Katze anlegen" ON cats FOR INSERT WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Katze aktualisieren" ON cats FOR UPDATE USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- TABELLE: feeding_logs
CREATE TABLE IF NOT EXISTS feeding_logs (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cat_id       UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  food_brand   TEXT NOT NULL,
  food_type    TEXT NOT NULL,
  amount_grams INTEGER,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feeding_logs_cat_logged ON feeding_logs (cat_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_feeding_logs_user ON feeding_logs (user_id);

ALTER TABLE feeding_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Eigene Futter-Logs lesen" ON feeding_logs FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Futter-Logs anlegen" ON feeding_logs FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Futter-Logs aktualisieren" ON feeding_logs FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Futter-Logs loeschen" ON feeding_logs FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- TABELLE: health_logs
CREATE TABLE IF NOT EXISTS health_logs (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cat_id            UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stool_consistency stool_consistency NOT NULL DEFAULT 'not_observed',
  vomiting          BOOLEAN NOT NULL DEFAULT FALSE,
  appetite          appetite_level NOT NULL DEFAULT 'good',
  activity          activity_level NOT NULL DEFAULT 'normal',
  fur_issue         BOOLEAN NOT NULL DEFAULT FALSE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_logs_cat_logged ON health_logs (cat_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_logs_user ON health_logs (user_id);

ALTER TABLE health_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Eigene Health-Logs lesen" ON health_logs FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Health-Logs anlegen" ON health_logs FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Health-Logs aktualisieren" ON health_logs FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Health-Logs loeschen" ON health_logs FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Betreuungszeiträume: Wann sind die Katzen nicht zuhause?
--
-- In dieser Zeit betreut sie jemand, der sie weniger gut kennt. Die
-- Futterempfehlung soll dann nichts Neues vorschlagen und schlecht vertragene
-- Sorten deutlicher meiden – ein Durchfall an einem fremden Ort ist der
-- unangenehmste Fall.
--
-- date statt timestamptz: Ein Betreuungszeitraum sind ganze Kalendertage.
-- (idempotent)

CREATE TABLE IF NOT EXISTS absences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_on  date NOT NULL,
  ends_on    date NOT NULL,
  label      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS absences_zeitraum_idx ON absences (starts_on, ends_on);

ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Haushalt liest Abwesenheiten" ON absences
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt legt Abwesenheiten an" ON absences
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt aendert Abwesenheiten" ON absences
    FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt loescht Abwesenheiten" ON absences
    FOR DELETE USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

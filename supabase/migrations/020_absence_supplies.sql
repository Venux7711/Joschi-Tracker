-- Was ist für einen Betreuungszeitraum tatsächlich eingepackt?
--
-- Der Vorrat in der App ist der Bestand des Haushalts. Bei einer Betreuung
-- fährt aber nur ein Teil davon mit – der Rest steht weiter zuhause im Regal.
-- Empfiehlt die App aus dem Gesamtvorrat, schlägt sie Dosen vor, die tausend
-- Kilometer entfernt stehen. Genau das ist passiert.
--
-- brand/type statt eines Verweises auf pantry_items: Ein Vorratseintrag
-- verschwindet, sobald er leer ist. Was eingepackt war, soll trotzdem
-- nachvollziehbar bleiben – auch für die Auswertung danach. (idempotent)

CREATE TABLE IF NOT EXISTS absence_supplies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  absence_id  uuid NOT NULL REFERENCES absences(id) ON DELETE CASCADE,
  brand       text NOT NULL,
  type        text NOT NULL,
  quantity    integer NOT NULL CHECK (quantity > 0),
  -- Dosengröße mitschreiben: Die Menge muss auch dann noch stimmen, wenn der
  -- Vorratseintrag längst gelöscht ist.
  size_grams  integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (absence_id, brand, type)
);

CREATE INDEX IF NOT EXISTS absence_supplies_absence_idx ON absence_supplies (absence_id);

ALTER TABLE absence_supplies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Haushalt liest Proviant" ON absence_supplies
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt legt Proviant an" ON absence_supplies
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt aendert Proviant" ON absence_supplies
    FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt loescht Proviant" ON absence_supplies
    FOR DELETE USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

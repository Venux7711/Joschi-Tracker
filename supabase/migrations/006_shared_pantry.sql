-- Vorrat gehört dem Haushalt, nicht dem Ersteller: Die App hat keinen
-- öffentlichen Signup (nur eingeladene Nutzer, aktuell Maik & Eva), daher
-- darf jeder angemeldete Nutzer den gemeinsamen Vorrat lesen UND ändern.
-- Policies sind permissiv (OR-verknüpft) – bestehende Ersteller-Policies
-- müssen dafür nicht angefasst werden. (idempotent)

DO $$ BEGIN
  CREATE POLICY "Haushalt liest Vorrat" ON pantry_items
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt legt Vorrat an" ON pantry_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt aendert Vorrat" ON pantry_items
    FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt loescht Vorrat" ON pantry_items
    FOR DELETE USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

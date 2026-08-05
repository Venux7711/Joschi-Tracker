-- Gemeinsame Fotobibliothek: Fotos gehören dem Haushalt, nicht dem Uploader
-- und nicht einer einzelnen Katze. Die App hat keinen öffentlichen Signup
-- (nur eingeladene Nutzer), daher darf jeder angemeldete Nutzer alle Fotos
-- lesen, anlegen, bearbeiten und löschen.
--
-- Bestehende Fotos bleiben unverändert: cat_id wird NICHT geleert, sondern
-- bleibt als "wer ist auf dem Bild"-Markierung erhalten. Nur die Sichtbarkeit
-- ist nicht länger an eine Katze gebunden. (idempotent)

-- Lese-Policy existiert bereits haushaltsweit (002_photos.sql), INSERT/DELETE
-- waren aber auf den Uploader beschränkt → Eva konnte Maiks Fotos nicht löschen.
DO $$ BEGIN
  CREATE POLICY "Haushalt legt Fotos an" ON photos
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt aendert Fotos" ON photos
    FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt loescht Fotos" ON photos
    FOR DELETE USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- cat_id ist ab jetzt eine optionale Markierung ("wer ist drauf"), kein
-- Pflichtfeld für die Zugehörigkeit. Für neue Fotos ohne erkennbare Katze
-- darf die Spalte leer bleiben; ON DELETE CASCADE würde Fotos beim Löschen
-- einer Katze mitreißen, daher auf SET NULL umstellen.
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'photos'::regclass
    AND contype = 'f'
    AND confrelid = 'cats'::regclass
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE photos DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE photos
    ADD CONSTRAINT photos_cat_id_fkey
    FOREIGN KEY (cat_id) REFERENCES cats(id) ON DELETE SET NULL;
END $$;

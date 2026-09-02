-- Nicht nur gestern: Woche und Archiv dazu.
--
-- Bisher gab es genau eine Karte, und die handelte immer vom Vortag. Das ist
-- weniger, als die Daten hergeben, und zwar aus einem inhaltlichen Grund: Ein
-- Tag hat Situationen, eine Woche hat Veraenderung. "Dreimal Nautilus, dann
-- nie wieder" laesst sich an einem Dienstag gar nicht sagen. Genau diesen
-- Stoff bewertet die Humor-Engine am hoechsten (Rueckgriff) und bekommt ihn
-- aus einem einzelnen Tag am seltensten.
--
-- Dazu kommt: Ein Tag ohne Fotos ergibt gar nichts. Eine Woche immer etwas.
--
-- zeitraum:
--   'tag'    - gestern, wie bisher
--   'woche'  - die sieben Tage bis gestern, rollend
--   'damals' - derselbe Tag vor einem Jahr, sonst vor einem Monat
--
-- Der Schluessel wird um zeitraum erweitert. tag bleibt der letzte Tag des
-- Fensters, damit das Archiv chronologisch sortiert bleibt, egal wie breit
-- das Fenster war.
-- (idempotent)

ALTER TABLE cat_thoughts ADD COLUMN IF NOT EXISTS zeitraum text NOT NULL DEFAULT 'tag';

DO $$ BEGIN
  ALTER TABLE cat_thoughts ADD CONSTRAINT cat_thoughts_zeitraum_check
    CHECK (zeitraum IN ('tag', 'woche', 'damals'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN cat_thoughts.zeitraum IS
  'Ueber welchen Ausschnitt geredet wird: tag, woche oder damals. tag traegt den letzten Tag des Fensters.';

-- Der alte Schluessel liesse nur eine Karte je Tag zu. Erst weg, dann neu.
ALTER TABLE cat_thoughts DROP CONSTRAINT IF EXISTS cat_thoughts_tag_stimme_key;

DO $$ BEGIN
  ALTER TABLE cat_thoughts ADD CONSTRAINT cat_thoughts_tag_zeitraum_stimme_key
    UNIQUE (tag, zeitraum, stimme);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS cat_thoughts_zeitraum_idx ON cat_thoughts (zeitraum, tag DESC);

-- Die vorhandenen Saetze sind mit der alten Anweisung entstanden, die noch
-- kein Fazit ohne Bildnummer kannte.
DELETE FROM cat_thoughts;

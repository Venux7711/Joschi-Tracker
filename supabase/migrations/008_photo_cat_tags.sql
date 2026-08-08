-- "Wer ist auf dem Bild?" ist nachträglich änderbar und kann mehr als eine Katze
-- sein (Joschi UND Bella auf demselben Foto). Die bisherige Einzelspalte cat_id
-- kann das nicht abbilden, deshalb kommt cat_ids als Array dazu.
--
-- cat_id bleibt als Spalte bestehen und wird von der API immer auf den ersten
-- Eintrag von cat_ids gesetzt – so brechen ältere Abfragen nicht. (idempotent)

ALTER TABLE photos ADD COLUMN IF NOT EXISTS cat_ids uuid[] NOT NULL DEFAULT '{}';

-- Bestehende Fotos übernehmen ihre bisherige Markierung
UPDATE photos
SET cat_ids = ARRAY[cat_id]
WHERE cat_id IS NOT NULL AND cat_ids = '{}';

-- Für den Filter "nur Fotos von Bella" (cat_ids @> ARRAY[...])
CREATE INDEX IF NOT EXISTS photos_cat_ids_idx ON photos USING gin (cat_ids);

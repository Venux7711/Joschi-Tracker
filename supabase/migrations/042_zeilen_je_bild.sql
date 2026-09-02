-- Ein Satz je Bild statt eines Satzes je Stimme.
--
-- Seit die Karte alle Fotos des Tages zeigt, stimmte die Zuordnung nicht mehr:
-- Der Text gehoerte zu einem Bild, angezeigt wurde er zu jedem. Wer das dritte
-- Foto antippt und den Kommentar zum ersten liest, haelt die App zu Recht fuer
-- kaputt.
--
-- Das Modell liefert ohnehin mehrere Vorschlaege je Stimme, jeder mit einer
-- Bildnummer. Bisher wurde der beste behalten und der Rest weggeworfen. Jetzt
-- bleibt je Bild der beste stehen.
--
-- Als jsonb an der bestehenden Zeile statt einer eigenen Tabelle: Die Zeilen
-- gehoeren untrennbar zu diesem Gedanken, werden immer zusammen gelesen und
-- nie einzeln abgefragt. text und foto_url bleiben unveraendert und tragen
-- weiterhin den Hauptsatz - so bleibt alles Bestehende funktionsfaehig.
-- (idempotent)

ALTER TABLE cat_thoughts ADD COLUMN IF NOT EXISTS zeilen jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN cat_thoughts.zeilen IS
  'Je Bild ein Satz: [{fotoId, fotoUrl, text, premise}]. Der Hauptsatz steht zusaetzlich in text.';

-- Die vorhandenen Zeilen kennen noch keinen Satz je Bild.
DELETE FROM cat_thoughts;

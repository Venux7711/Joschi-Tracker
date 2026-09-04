-- Verkleinerte Fassungen im eigenen Speicher, statt sie bei jedem Blick neu
-- berechnen zu lassen.
--
-- Anlass: Das Freikontingent des Bilddienstes (5000 Transformationen im Monat)
-- war nach wenigen Wochen aufgebraucht, danach liefern neue Bildgroessen einen
-- Fehler statt eines Bildes.
--
-- Die Zahlen dazu: 99 Fotos, 237 MB, im Schnitt 2,4 MB je Bild. Fotos werden
-- beim Hochladen nicht verkleinert - es liegen Handy-Aufnahmen in voller
-- Aufloesung im Speicher, und der Bilddienst rechnete 2,4 MB bei jedem Blick
-- auf 130 Pixel herunter. Deshalb war "Optimierung einfach abschalten" keine
-- Loesung: Ein Galerie-Durchlauf waeren 237 MB Mobilfunk.
--
-- Stattdessen einmalig zwei Fassungen je Bild:
--   thumb_url  ~400 px  fuer Kacheln und Streifen   (~40 kB)
--   view_url  ~1600 px  fuer Vollbild und Karten   (~250 kB)
--
-- Danach: Galerie-Durchlauf ~4 MB statt 237 MB, null Transformationen, und
-- der Bilddienst wird gar nicht mehr gebraucht. Die Originale bleiben liegen -
-- Speicher ist nicht das Problem, und ein weggerechnetes Foto kommt nicht
-- zurueck.
--
-- derivate_state:
--   NULL     - noch nicht bearbeitet
--   'fertig' - beide Fassungen liegen vor
--   'fehler' - Umrechnen ist gescheitert, wird nicht endlos wiederholt
-- (idempotent)

ALTER TABLE photos ADD COLUMN IF NOT EXISTS thumb_url text;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS view_url text;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS derivate_state text;

DO $$ BEGIN
  ALTER TABLE photos ADD CONSTRAINT photos_derivate_state_check
    CHECK (derivate_state IS NULL OR derivate_state IN ('fertig', 'fehler'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN photos.thumb_url IS
  'Verkleinerte Fassung ~400 px fuer Kacheln. Wird ohne Bilddienst ausgeliefert.';
COMMENT ON COLUMN photos.view_url IS
  'Verkleinerte Fassung ~1600 px fuer Vollbild. Wird ohne Bilddienst ausgeliefert.';

-- Der Nachlauf sucht genau danach: was noch keine Fassungen hat und nicht
-- schon einmal gescheitert ist.
CREATE INDEX IF NOT EXISTS photos_ohne_ableitung_idx
  ON photos (taken_at DESC)
  WHERE thumb_url IS NULL AND derivate_state IS NULL;

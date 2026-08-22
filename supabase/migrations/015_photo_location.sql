-- Aufnahmeort aus den EXIF-Daten der Fotos.
--
-- Damit lässt sich sehen, wo die Katzen wann waren – etwa während einer
-- Betreuung außer Haus.
--
-- Nicht jedes Foto hat einen Ort: iOS hängt Koordinaten nur an, wenn das Bild
-- aus der Fotobibliothek gewählt wird. Über den Kamera-Knopf im Browser
-- aufgenommene Bilder haben grundsätzlich keine. Deshalb nullable.
-- (idempotent)

ALTER TABLE photos ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS lng double precision;

COMMENT ON COLUMN photos.lat IS 'Breitengrad aus den EXIF-Daten, falls vorhanden.';

CREATE INDEX IF NOT EXISTS photos_location_idx ON photos (taken_at) WHERE lat IS NOT NULL;

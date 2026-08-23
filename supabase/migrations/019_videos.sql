-- Videos im Album, nicht nur Fotos.
--
-- Videos landen in derselben Tabelle wie Fotos: Es ist eine gemeinsame
-- Zeitleiste, die Katzen-Markierung, Reaktionen und Kommentare gelten
-- unverändert. Eine getrennte Tabelle würde jede dieser Funktionen doppeln.
--
-- poster_url zeigt auf ein Standbild, das der Browser beim Hochladen aus dem
-- Video greift. Ohne das wäre die Kachel im Raster schwarz, und alle anderen
-- Stellen der App (Collage, Erinnerung, Geburtstag) könnten ein Video gar
-- nicht darstellen – die zeigen Standbilder. (idempotent)

ALTER TABLE photos ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'photo';
ALTER TABLE photos ADD COLUMN IF NOT EXISTS poster_url text;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS poster_path text;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS duration_seconds numeric;

DO $$ BEGIN
  ALTER TABLE photos ADD CONSTRAINT photos_media_type_check
    CHECK (media_type IN ('photo', 'video'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN photos.media_type IS 'photo oder video – bestimmt, wie die App den Eintrag darstellt.';
COMMENT ON COLUMN photos.poster_url  IS 'Standbild aus dem Video, für Raster und alle Stellen die nur Bilder zeigen.';
COMMENT ON COLUMN photos.poster_path IS 'Storage-Pfad des Standbilds, damit es beim Löschen mitgeht.';
COMMENT ON COLUMN photos.duration_seconds IS 'Laufzeit in Sekunden, für die Einblendung auf der Kachel.';

-- Nur Videos brauchen den Index; Fotos sind die überwältigende Mehrheit.
CREATE INDEX IF NOT EXISTS photos_media_type_idx ON photos (media_type) WHERE media_type <> 'photo';

-- Der Bucket wurde seinerzeit über die Oberfläche angelegt und lässt womöglich
-- nur Bilder und kleine Dateien zu. Ein Handyvideo von einer Minute liegt
-- schnell bei 60 MB, deshalb hier explizit setzen.
-- Abgesichert: Reichen die Rechte hier nicht, sollen trotzdem die Spalten
-- oben ankommen. Sonst stünde die App vor einer Datenbank ohne media_type –
-- und genau diese Reihenfolge hat schon einmal zu einem Ausfall geführt.
DO $$ BEGIN
  UPDATE storage.buckets
  SET
    file_size_limit = 104857600,  -- 100 MB
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/mpeg', 'video/3gpp'
    ]
  WHERE id = 'joschi-photos';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'Bucket-Grenzen konnten nicht gesetzt werden – bitte in der Supabase-Oberflaeche pruefen.';
END $$;

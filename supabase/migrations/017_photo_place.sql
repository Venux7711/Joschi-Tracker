-- Lesbarer Ortsname zum Foto.
--
-- lat/lng allein helfen niemandem: "49.4689, 11.0956" beantwortet die Frage
-- "wo waren die Katzen" nicht. Der Name wird einmal beim Hochladen aufgelöst
-- und gespeichert – nicht bei jeder Anzeige, das verlangen schon die
-- Nutzungsbedingungen von Nominatim. (idempotent)

ALTER TABLE photos ADD COLUMN IF NOT EXISTS place text;

COMMENT ON COLUMN photos.place IS
  'Kurzform wie "Hintermayrstraße, Nürnberg", aus lat/lng aufgelöst.';

CREATE INDEX IF NOT EXISTS photos_place_idx ON photos (place) WHERE place IS NOT NULL;

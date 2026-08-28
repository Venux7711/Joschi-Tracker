-- Videos nach dem Hochladen im Hintergrund verkleinern.
--
-- Die Umkehrung der bisherigen Richtung: Das Handy macht den einfachen Teil
-- (hochladen), das Verkleinern übernimmt später ein Rechner, der nichts
-- anderes zu tun hat. Vier Anläufe im Browser sind daran gescheitert, dass
-- ein iPhone das Video dafür in Echtzeit abspielen muss – mit allen
-- Sichtbarkeitsregeln, Abspielsperren und der Rechenlast, die dazugehören.
--
-- Diese Spalten sind die Warteschlange. Mehr braucht es nicht: Ein Eintrag
-- mit 'wartet' ist Arbeit, alles andere ist erledigt. (idempotent)

ALTER TABLE photos ADD COLUMN IF NOT EXISTS compress_state text;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS compress_error text;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS original_bytes bigint;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS compressed_bytes bigint;

DO $$ BEGIN
  ALTER TABLE photos ADD CONSTRAINT photos_compress_state_check
    CHECK (compress_state IN ('wartet', 'laeuft', 'fertig', 'uebersprungen', 'fehler'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN photos.compress_state IS
  'wartet = noch zu verkleinern, laeuft = wird gerade bearbeitet, fertig/uebersprungen/fehler = erledigt. NULL bei Fotos.';
COMMENT ON COLUMN photos.original_bytes IS
  'Größe beim Hochladen – ohne die ließe sich hinterher nicht sagen, ob das Verkleinern etwas gebracht hat.';

-- Der Hintergrundlauf sucht ausschließlich nach Wartendem. Ein Teilindex
-- bleibt winzig, auch wenn Tausende Fotos in der Tabelle stehen.
CREATE INDEX IF NOT EXISTS photos_compress_offen_idx
  ON photos (created_at)
  WHERE compress_state IN ('wartet', 'laeuft');

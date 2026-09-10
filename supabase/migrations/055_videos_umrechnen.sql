-- Vorhandene Videos im falschen Behaelter zum Umrechnen anmelden.
--
-- Nachgesehen an der Datei, die nicht abspielte (13 Sekunden, 2,1 MB):
--   Container : qt        -> Content-Type video/quicktime
--   Codecs    : avc1, mp4a -> H.264 und AAC, also harmlos
--   Tonspur   : vorhanden
--   faststart : nein, der moov-Block liegt am Dateiende
--
-- Die Codecs sind es also nicht. Der Behaelter ist es: Safari spielt
-- video/quicktime, Chrome und Firefox nur manchmal. Und weil das
-- Inhaltsverzeichnis hinten liegt, muss der Browser es erst suchen, bevor er
-- anfangen kann.
--
-- Der Durchlauf, der ohnehin fuer grosse Videos existiert, behebt beides: neu
-- kodiert nach mp4 mit -movflags +faststart und -c:a aac. Bisher wurde er nur
-- nach Dateigroesse angestossen, und ein 2-MB-Video ist nun einmal klein.
--
-- Neue Uploads melden sich ab jetzt selbst an; diese Zeile holt nach, was
-- schon liegt. 'wartet' schadet nicht, solange der Lauf nicht ausfuehrbar ist -
-- die Videos bleiben abspielbar wie bisher, nur eben im alten Behaelter.
-- (idempotent)

UPDATE photos
SET compress_state = 'wartet'
WHERE media_type = 'video'
  AND storage_path NOT ILIKE '%.mp4'
  AND coalesce(compress_state, '') <> 'wartet';

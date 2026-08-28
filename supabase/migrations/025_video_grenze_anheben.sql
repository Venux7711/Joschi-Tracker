-- Größere Videos direkt zulassen, statt sie erst umrechnen zu müssen.
--
-- Der Stand nach vier Anläufen: Im Album liegen 54 Fotos und null Videos.
-- Kein einziges ist je durchgekommen, weil jedes über 100 MB lag und damit
-- durch das Verkleinern musste – und das bleibt auf dem iPhone hängen.
--
-- Das Verkleinern im Browser ist der aufwendige Weg mit den meisten
-- Fehlerquellen: Es spielt das Video in Echtzeit ab, zeichnet jedes Bild auf
-- eine Leinwand und nimmt das wieder auf. Daran ist es dreimal gescheitert.
-- Die Grenze anzuheben löst dasselbe Problem ohne jede Technik – das Video
-- wird einfach hochgeladen.
--
-- Der Preis steht am Ende dieser Datei: Der Speicherplatz ist begrenzt, und
-- ein Handyvideo ist ein Vielfaches eines Fotos. Deshalb wird der aktuelle
-- Verbrauch mit ausgegeben, damit die Entscheidung auf Zahlen beruht.

DO $$ BEGIN
  UPDATE storage.buckets
  SET file_size_limit = 419430400  -- 400 MB
  WHERE id = 'joschi-photos';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'Grenze konnte nicht gesetzt werden.';
END $$;

SELECT
  b.id,
  round(b.file_size_limit / 1048576.0, 1)                        AS grenze_mb,
  count(o.id)                                                    AS dateien,
  round(coalesce(sum((o.metadata->>'size')::bigint), 0) / 1048576.0, 1) AS belegt_mb
FROM storage.buckets b
LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.id, b.file_size_limit;

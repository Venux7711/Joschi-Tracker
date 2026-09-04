-- Nur nachsehen, nichts aendern.
--
-- Das Freikontingent fuer Bildoptimierung ist aufgebraucht. Die Frage, ob man
-- den Bilddienst voruebergehend umgehen kann, haengt an genau einer Zahl: Wie
-- gross sind die Originale? Fotos werden beim Hochladen nicht verkleinert -
-- nur Video-Standbilder -, also koennten es Handy-Aufnahmen in voller
-- Aufloesung sein. Eine Galerie mit hundert solchen Bildern ohne Optimierung
-- waere auf dem Handy unbenutzbar.

SELECT
  coalesce(right(name, 4), '?') AS endung,
  count(*) AS anzahl,
  pg_size_pretty(sum((metadata->>'size')::bigint)) AS gesamt,
  pg_size_pretty(avg((metadata->>'size')::bigint)::bigint) AS im_schnitt,
  pg_size_pretty(max((metadata->>'size')::bigint)) AS groesstes
FROM storage.objects
WHERE bucket_id = 'joschi-photos'
  AND metadata->>'size' IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;

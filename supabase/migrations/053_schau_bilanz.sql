-- Nur nachsehen, nichts aendern: Was hat das Verkleinern gebracht?

SELECT
  CASE WHEN name LIKE 'ableitungen/%400.jpg'  THEN '2 Kacheln  (~400 px)'
       WHEN name LIKE 'ableitungen/%1600.jpg' THEN '3 Ansichten (~1600 px)'
       ELSE '1 Originale' END AS art,
  count(*) AS anzahl,
  pg_size_pretty(sum((metadata->>'size')::bigint)) AS gesamt,
  pg_size_pretty(avg((metadata->>'size')::bigint)::bigint) AS im_schnitt
FROM storage.objects
WHERE bucket_id = 'joschi-photos' AND metadata->>'size' IS NOT NULL
GROUP BY 1
ORDER BY 1;

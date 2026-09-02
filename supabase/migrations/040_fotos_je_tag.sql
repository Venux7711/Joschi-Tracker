-- Nur nachsehen: Wie viele Fotos gibt es je Tag, und welche wurden benutzt?
--
-- Die Klage lautet, dass immer dieselben drei Bilder erscheinen. Bevor daran
-- weitergebaut wird, muss die Voraussetzung geklaert sein: Wenn ein Tag
-- ueberhaupt nur drei Fotos hat, gibt es keine anderen zu zeigen. Dann waere
-- jede Aenderung an der Auswahl wirkungslos.
--
-- Diese Migration veraendert nichts.

SELECT
  to_char(taken_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS tag,
  count(*)                                                     AS fotos,
  count(DISTINCT date_trunc('hour', taken_at AT TIME ZONE 'Europe/Berlin')) AS stunden,
  count(DISTINCT coalesce(place, '-'))                         AS orte
FROM photos
WHERE taken_at > now() - interval '12 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Nur nachsehen, nichts aendern.
--
-- Ein hochgeladenes Video liess sich nicht abspielen. Die Ursache steht schon
-- im Code: Der <video>-Tag bekam seit der Bild-Umstellung ansichtQuelle(), und
-- das ist bei einem Video die verkleinerte Fassung des Standbilds - ein JPEG.
--
-- Diese Abfrage prueft die zweite Haelfte: Ist mit der Zeile selbst alles in
-- Ordnung? Steht compress_state noch auf 'wartet', hat der naechtliche Lauf
-- das Video nie angefasst - und dann fehlt womoeglich auch der Ton, weil er
-- erst beim Umrechnen sauber neu geschrieben wird.

SELECT
  to_char(taken_at AT TIME ZONE 'Europe/Berlin', 'DD.MM. HH24:MI') AS wann,
  media_type,
  coalesce(compress_state, '-') AS umrechnung,
  CASE WHEN poster_url IS NULL THEN 'FEHLT' ELSE 'ja' END AS standbild,
  CASE WHEN view_url IS NULL THEN 'nein' ELSE 'ja' END AS ableitung,
  coalesce(round(duration_seconds::numeric, 1)::text, '?') AS sekunden,
  coalesce(pg_size_pretty(original_bytes), '?') AS original,
  public_url
FROM photos
WHERE media_type = 'video'
ORDER BY taken_at DESC
LIMIT 10;

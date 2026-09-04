-- Nur nachsehen, nichts aendern.
--
-- Zweimal dieselbe Meldung nach einem Fix heisst: geraten statt gemessen.
-- "Damals hat nur ein Bild" und "Joschi redet in der Er-Form" muessen eine
-- Ursache in den Daten haben, und die steht hier.
--
-- Drei Fragen:
--   1. Wie viele Zeilen haben die Karten wirklich, und mit welcher
--      Prompt-Fassung sind sie entstanden? (Steht dort eine alte, wurde nach
--      dem Deploy nie neu erzeugt - dann liegt es nicht am Prompt.)
--   2. Wie viele Fotos hat der Damals-Tag, und haben die eine Adresse?
--   3. Wie viele Fotos sind ueberhaupt mit einer Katze markiert? Ohne
--      Markierung weiss das Modell nicht, wer zu sehen ist - und schreibt
--      dann folgerichtig "er" statt "ich".

WITH karten AS (
  SELECT
    zeitraum, tag, stimme,
    jsonb_array_length(zeilen) AS zeilen_n,
    coalesce(prompt_version, '-') AS fassung,
    erzeugt_von,
    left(text, 130) AS anfang
  FROM cat_thoughts
),
fotos_je_tag AS (
  SELECT
    (taken_at AT TIME ZONE 'Europe/Berlin')::date AS d,
    count(*) AS n,
    count(*) FILTER (WHERE coalesce(public_url, poster_url) IS NOT NULL) AS mit_adresse,
    count(*) FILTER (WHERE coalesce(array_length(cat_ids, 1), 0) > 0 OR cat_id IS NOT NULL) AS markiert
  FROM photos
  GROUP BY 1
),
markierung_gesamt AS (
  SELECT
    count(*) AS fotos_gesamt,
    count(*) FILTER (WHERE coalesce(array_length(cat_ids, 1), 0) > 0 OR cat_id IS NOT NULL) AS markiert
  FROM photos
)
SELECT '1 karte' AS art,
       zeitraum || ' | ' || tag || ' | ' || stimme
       || ' | zeilen=' || zeilen_n
       || ' | ' || fassung || '/' || erzeugt_von
       || ' | ' || anfang AS zeile
FROM karten
UNION ALL
SELECT '2 fotos am damals-tag',
       d::text || ' | fotos=' || n || ' | mit_adresse=' || mit_adresse || ' | markiert=' || markiert
FROM fotos_je_tag
WHERE d IN (SELECT DISTINCT tag FROM cat_thoughts WHERE zeitraum = 'damals')
UNION ALL
SELECT '3 markierung insgesamt',
       'fotos=' || fotos_gesamt || ' | davon markiert=' || markiert
FROM markierung_gesamt
ORDER BY 1, 2;

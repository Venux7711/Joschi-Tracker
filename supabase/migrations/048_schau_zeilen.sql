-- Nur nachsehen, nichts aendern.
--
-- 047 hat die Ueberschriften gezeigt, und die waren alle richtig: Joschi sagt
-- "ich", Bella sagt "er" ueber ihn. Der Befund "Joschi redet in der Er-Form"
-- muss also aus den Stationszeilen kommen - je Bild ein Satz, und die stehen
-- im jsonb, nicht in text.
--
-- Entscheidend ist die Gegenueberstellung: Welche Katze ist auf dem Foto
-- markiert, und wie redet die Stimme darueber? Steht unter Joschi ein "er" zu
-- einem Foto, auf dem Joschi markiert ist, ist es der gemeldete Fehler. Steht
-- es zu einem Foto mit Bella, waere "sie" richtig und "er" ein anderer Fehler.

WITH zeile AS (
  SELECT
    t.zeitraum, t.tag, t.stimme,
    (e->>'fotoId')::uuid AS foto_id,
    e->>'text' AS satz,
    ordinality AS nr
  FROM cat_thoughts t,
       jsonb_array_elements(t.zeilen) WITH ORDINALITY AS a(e, ordinality)
  WHERE t.tag >= '2026-09-01' OR t.zeitraum = 'damals'
)
SELECT
  z.zeitraum || ' | ' || z.tag || ' | ' || z.stimme || ' #' || z.nr AS karte,
  coalesce(
    (SELECT string_agg(c.name, '+' ORDER BY c.name)
     FROM cats c
     WHERE c.id = ANY(coalesce(p.cat_ids, ARRAY[]::uuid[])) OR c.id = p.cat_id),
    'NIEMAND'
  ) AS markiert,
  z.satz
FROM zeile z
LEFT JOIN photos p ON p.id = z.foto_id
ORDER BY 1;

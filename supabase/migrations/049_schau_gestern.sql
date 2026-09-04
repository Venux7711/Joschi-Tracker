-- Nur nachsehen, nichts aendern.
--
-- 048 lieferte 90 Zeilen, das Protokoll zeigt 50. Ausgerechnet die Karte, um
-- die es geht - die von gestern - fiel unter den Tisch. Also enger fassen.
--
-- 048 hat schon etwas Wichtiges gezeigt: Auf dem Ofen-Foto vom 1.9. ist in der
-- Datenbank Bella markiert, aber beide Stimmen reden uebereinstimmend ueber
-- Joschi ("Er liegt auf dem Ofen" / "Niemand stoert mich hier oben"). Die
-- Markierung und das Bild widersprechen sich also - und die Anweisung erklaert
-- die Markierung fuer verbindlich.

SELECT
  z.stimme || ' #' || z.nr AS karte,
  coalesce(
    (SELECT string_agg(c.name, '+' ORDER BY c.name)
     FROM cats c
     WHERE c.id = ANY(coalesce(p.cat_ids, ARRAY[]::uuid[])) OR c.id = p.cat_id),
    'NIEMAND'
  ) AS markiert,
  to_char(p.taken_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI') AS uhr,
  z.satz
FROM (
  SELECT t.stimme, e->>'fotoId' AS foto_id, e->>'text' AS satz, ordinality AS nr
  FROM cat_thoughts t,
       jsonb_array_elements(t.zeilen) WITH ORDINALITY AS a(e, ordinality)
  WHERE t.zeitraum = 'tag' AND t.tag = '2026-09-03'
) z
LEFT JOIN photos p ON p.id = z.foto_id::uuid
ORDER BY 1;

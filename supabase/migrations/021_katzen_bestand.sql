-- Nur nachsehen, nichts ändern: Welche Katzen stehen in der Tabelle?
--
-- Anlass: In der App taucht Joschi zweimal auf. Bevor irgendetwas
-- zusammengeführt oder gelöscht wird, muss der tatsächliche Bestand auf dem
-- Tisch liegen – wie viele Zeilen, wem gehören sie, und wieviele Einträge
-- hängen jeweils daran. Ein Löschen auf Verdacht würde Fütterungen und
-- Befinden mitreißen (ON DELETE CASCADE).
--
-- Diese Migration verändert nichts. Das Ergebnis erscheint im Protokoll der
-- GitHub-Action.

SELECT
  c.id,
  c.name,
  c.owner_id,
  c.created_at,
  (SELECT count(*) FROM feeding_logs f WHERE f.cat_id = c.id) AS fuetterungen,
  (SELECT count(*) FROM health_logs  h WHERE h.cat_id = c.id) AS befinden,
  (SELECT count(*) FROM photos       p WHERE p.cat_id = c.id) AS fotos_einzeln,
  (SELECT count(*) FROM photos       p WHERE p.cat_ids @> ARRAY[c.id]) AS fotos_markiert,
  (SELECT count(*) FROM pantry_items v WHERE v.cat_id = c.id) AS vorrat
FROM cats c
ORDER BY c.name, c.created_at;

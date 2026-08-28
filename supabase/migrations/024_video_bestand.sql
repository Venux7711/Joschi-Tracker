-- Nur nachsehen: Ist überhaupt je ein Video angekommen?
--
-- Bisher wurde immer nur über das Verkleinern gesprochen. Ob der Weg dahinter
-- – Hochladen, Eintrag anlegen, Standbild speichern – jemals funktioniert
-- hat, weiß niemand. Falls schon ein Video unter der Größengrenze scheitert,
-- liegt der Fehler ganz woanders und alles Verkleinern wäre umsonst.
--
-- Diese Migration verändert nichts.

SELECT
  coalesce(media_type, 'photo') AS art,
  count(*)                      AS anzahl,
  count(poster_url)             AS mit_standbild,
  min(taken_at)                 AS aeltestes,
  max(taken_at)                 AS neuestes
FROM photos
GROUP BY 1
ORDER BY 1;

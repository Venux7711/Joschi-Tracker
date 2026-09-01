-- Nur nachsehen: Was liefert die Humor-Erzeugung gerade?
--
-- Am Ton zu drehen, ohne den Text gesehen zu haben, war in dieser Baustelle
-- schon einmal ein Fehlschlag. Interessant ist neben dem Satz vor allem, ob
-- Erinnerungen eingeflossen sind und ob der Ersatztext gegriffen hat – das
-- sind drei völlig verschiedene Ursachen für einen schwachen Satz.
--
-- Diese Migration verändert nichts.

SELECT
  tag,
  stimme,
  erzeugt_von,
  text,
  coalesce(array_length(used_memory_ids, 1), 0) AS erinnerungen_genutzt,
  prompt_version
FROM cat_thoughts
ORDER BY tag DESC, stimme
LIMIT 12;

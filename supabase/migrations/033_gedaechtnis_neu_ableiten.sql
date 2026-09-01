-- Die abgeleiteten Erinnerungen verwerfen, damit sie neu entstehen.
--
-- Der erste Durchlauf war technisch richtig und inhaltlich irreführend:
--
--   „Vorliebe: Bio Enten-Energie" – ausgesucht haben das die Menschen, und es
--   ist ausgerechnet die am schlechtesten vertragene Sorte.
--   „Vorliebe: Bronnbacher Straße" – das war der Betreuungsort. Eine Katze
--   sucht sich keine Straße aus.
--
-- Beide Sätze behaupten eine Neigung, wo nur ein Aufenthalt oder eine
-- Entscheidung der Menschen war. Die Ableitung kennt jetzt den Unterschied,
-- muss die Einträge dafür aber neu erzeugen.
--
-- Ausdrücklich nur Beobachtetes: Was ein Mensch richtiggestellt hat, bleibt.
-- Es wieder wegzuwerfen wäre genau das Gegenteil dessen, wofür die Korrektur
-- da ist.

DELETE FROM cat_memories WHERE source = 'beobachtung';

SELECT count(*) AS verbliebene_nutzerkorrekturen FROM cat_memories;

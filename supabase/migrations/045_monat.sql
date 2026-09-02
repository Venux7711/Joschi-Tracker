-- Der Monat als vierter Zeitraum.
--
-- Was ein Monat kann und eine Woche noch nicht: Er zeigt, was geblieben ist.
-- Eine Woche zeigt, dass sich etwas geaendert hat; ein Monat zeigt, dass etwas
-- zur Gewohnheit geworden ist - oder dass es aufgehoert hat, ohne dass es
-- jemand gemerkt hat.
-- (idempotent)

ALTER TABLE cat_thoughts DROP CONSTRAINT IF EXISTS cat_thoughts_zeitraum_check;

ALTER TABLE cat_thoughts ADD CONSTRAINT cat_thoughts_zeitraum_check
  CHECK (zeitraum IN ('tag', 'woche', 'monat', 'damals'));

-- Die Rueckblicke von gestern sind mit der alten Bildauswahl entstanden: Sie
-- nahm bei sieben Tagen und fuenf Plaetzen immer die fuenf aeltesten, endete
-- also zwei Tage vor gestern und legte am naechsten Tag fast dieselben Bilder
-- vor. Die Tagesgedanken bleiben stehen, sie sind davon nicht betroffen.
DELETE FROM cat_thoughts WHERE zeitraum <> 'tag';

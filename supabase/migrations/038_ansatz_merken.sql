-- Welcher Ansatz steckte hinter einem Gedanken?
--
-- Die Abwechslung entsteht ab jetzt aus der Bewertung, nicht aus einer festen
-- Rotation ueber den Kalender. Dafuer muss nachvollziehbar sein, welche Art
-- von Situation zuletzt dran war: Wer denselben Ansatz gestern schon hatte,
-- muss inhaltlich staerker sein, um wieder zu gewinnen.
--
-- Nebenbei beantwortet die Spalte spaeter die Frage, warum ein Satz so
-- ausfiel, wie er ausfiel. (idempotent)

ALTER TABLE cat_thoughts ADD COLUMN IF NOT EXISTS premise text;

COMMENT ON COLUMN cat_thoughts.premise IS
  'Die Art der Situation, auf der der Satz beruht - untertreibung, status, kontrast und so weiter.';

-- Die bisherigen Gedanken stammen aus der festen Rotation und wuerden die
-- neue Auswahl in eine Richtung ziehen, die es nicht mehr gibt.
DELETE FROM cat_thoughts;

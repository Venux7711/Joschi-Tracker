-- Geburtstag pro Katze. Grundlage für die Geburtstags-Überraschung im
-- Dashboard (am Tag selbst und am Tag danach) und für den Lebensjahr-Rückblick.
--
-- date statt timestamptz: Ein Geburtstag ist ein Kalendertag, keine Uhrzeit –
-- sonst würde die Zeitzone den Tag verschieben. (idempotent)

ALTER TABLE cats ADD COLUMN IF NOT EXISTS birthday date;

COMMENT ON COLUMN cats.birthday IS 'Geburtstag als Kalendertag (ohne Zeitzone).';

-- Bekannte Geburtstage eintragen, ohne bereits gepflegte Werte zu überschreiben
UPDATE cats SET birthday = DATE '2024-08-16' WHERE lower(name) = 'joschi' AND birthday IS NULL;
UPDATE cats SET birthday = DATE '2024-04-08' WHERE lower(name) = 'bella'  AND birthday IS NULL;

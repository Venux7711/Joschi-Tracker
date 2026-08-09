-- Dosengröße gehört an den Vorrat, nicht an die einzelne Fütterung.
--
-- Grund: Eine Dose reicht über mehrere Tage und wird von beiden Katzen
-- gemeinsam gefressen. Eine Grammzahl pro Fütterung wäre geraten – in 50 Tagen
-- wurde feeding_logs.amount_grams deshalb auch kein einziges Mal ausgefüllt.
-- Mit der Dosengröße am Vorrat lässt sich der tatsächliche Verbrauch dagegen
-- ausrechnen: verbrauchte Dosen × Größe.
--
-- Nullable: Für bestehende Einträge ist die Größe zunächst unbekannt und wird
-- im Vorrat nachgetragen. (idempotent)

ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS size_grams integer;

COMMENT ON COLUMN pantry_items.size_grams IS
  'Füllmenge einer Dose in Gramm. Verbrauch = verbrauchte Dosen x size_grams.';

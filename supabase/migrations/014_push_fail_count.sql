-- Abos nicht mehr beim ersten Fehler wegwerfen.
--
-- Bisher löschte schon ein einzelnes 410 von Apple das Abo. Das Gerät hält
-- seine Anmeldung aber weiter für gültig – in den Einstellungen stand dann
-- "bekommt nichts", und man musste neu aktivieren, ohne selbst etwas getan zu
-- haben. Genau das war die Beschwerde.
--
-- Jetzt wird gezählt und erst nach mehreren Fehlschlägen in Folge entfernt.
-- (idempotent)

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS fail_count integer NOT NULL DEFAULT 0;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_success_at timestamptz;

COMMENT ON COLUMN push_subscriptions.fail_count IS
  'Fehlschläge in Folge. Wird bei Erfolg zurückgesetzt, ab 3 wird das Abo entfernt.';

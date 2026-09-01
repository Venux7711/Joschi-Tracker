-- Fütterungen und Befinden gehören dem Haushalt, nicht dem Eintragenden.
--
-- Bisher galt für beide Tabellen: user_id = auth.uid(). Wer einen Eintrag
-- angelegt hat, war der Einzige, der ihn sehen, ändern oder löschen konnte.
--
-- Das passt nicht dazu, wie diese App benutzt wird. Gefüttert wird gemeinsam,
-- eingetragen von dem, der gerade das Handy in der Hand hat – Maik, Eva oder
-- Marion. Die Folgen waren gravierender als der gemeldete Fehler:
--
--   Ein Eintrag ließ sich nicht öffnen, wenn ihn jemand anderes angelegt hatte.
--   Schlimmer: Auch die Auswertungen liefen über die Sitzung des Anmeldeten.
--   Die Futterstatistik, die Verträglichkeitsrechnung und die Empfehlung sahen
--   also jeweils nur die Einträge einer Person. Bei drei Beteiligten hieß das:
--   Die Zahlen stimmten nie.
--
-- Vorrat (006) und Fotos (007) wurden aus demselben Grund schon umgestellt.
-- Hier fehlte es. Die App hat keine öffentliche Anmeldung; alle eingeladenen
-- Nutzer teilen sich einen Haushalt und dieselben Katzen.
--
-- Anlegen bleibt an die eigene Kennung gebunden: Wer schreibt, schreibt unter
-- seinem Namen. Nur Lesen, Ändern und Löschen wird geöffnet.

-- ── Fütterungen ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "Haushalt liest Futter" ON feeding_logs
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt aendert Futter" ON feeding_logs
    FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt loescht Futter" ON feeding_logs
    FOR DELETE USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Eigene Futter-Logs lesen" ON feeding_logs;
DROP POLICY IF EXISTS "Eigene Futter-Logs aktualisieren" ON feeding_logs;
DROP POLICY IF EXISTS "Eigene Futter-Logs loeschen" ON feeding_logs;

-- ── Befinden ────────────────────────────────────────────────────────────
-- Dasselbe Problem, dieselbe Begründung: Trägt Marion während der Betreuung
-- einen Durchfall ein, muss er zuhause sichtbar sein. Sonst ist die
-- Verträglichkeitsrechnung blind für genau die Tage, an denen es zählt.
DO $$ BEGIN
  CREATE POLICY "Haushalt liest Befinden" ON health_logs
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt aendert Befinden" ON health_logs
    FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt loescht Befinden" ON health_logs
    FOR DELETE USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Eigene Health-Logs lesen" ON health_logs;
DROP POLICY IF EXISTS "Eigene Health-Logs aktualisieren" ON health_logs;
DROP POLICY IF EXISTS "Eigene Health-Logs loeschen" ON health_logs;

-- Zum Nachsehen: Wie viele Einträge stammen von wem?
SELECT
  'feeding_logs' AS tabelle, user_id, count(*) AS anzahl
FROM feeding_logs GROUP BY user_id
UNION ALL
SELECT 'health_logs', user_id, count(*) FROM health_logs GROUP BY user_id;

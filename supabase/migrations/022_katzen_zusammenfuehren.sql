-- Doppelte Katzen zusammenführen und die Ursache für neue verschließen.
--
-- Vorgefunden (Migration 021): zwei Joschis desselben Besitzers. Der echte
-- vom 19.06. mit 95 Fütterungen, 22 Befinden, 34 Fotos und 12 Dosen Vorrat –
-- daneben einer vom 27.08. mit zwei Fütterungen und sonst nichts. Entstanden
-- ist er, weil das Dashboard bei einer misslungenen Abfrage nicht von einer
-- leeren Tabelle unterscheiden konnte und prompt eine Katze anlegte.
--
-- Nichts wird weggeworfen: Alles, was am Doppelgänger hängt, wird zuerst auf
-- den älteren Eintrag umgehängt. Erst danach verschwindet die dann leere
-- Zeile. Ohne das Umhängen würden die Fütterungen mitgelöscht – an cats
-- hängen die Fremdschlüssel mit ON DELETE CASCADE.
--
-- Die Auswahl ist bewusst eng: gleicher Name UND gleicher Besitzer. Zwei
-- Katzen mit demselben Namen in verschiedenen Haushalten sind keine Dubletten.

DO $$
DECLARE
  behalten uuid;
  weg      uuid;
  bezug    record;
BEGIN
  FOR behalten, weg IN
    SELECT aeltest.id, neuer.id
    FROM cats aeltest
    JOIN cats neuer
      ON neuer.name = aeltest.name
     AND neuer.owner_id IS NOT DISTINCT FROM aeltest.owner_id
     AND neuer.created_at > aeltest.created_at
    WHERE aeltest.created_at = (
      SELECT min(c.created_at) FROM cats c
      WHERE c.name = aeltest.name AND c.owner_id IS NOT DISTINCT FROM aeltest.owner_id
    )
  LOOP
    RAISE NOTICE 'Führe % auf % zusammen', weg, behalten;

    -- Alle Tabellen mit einem Fremdschlüssel auf cats umhängen – aufzählen
    -- wäre fehleranfällig, es sind Fütterungen, Befinden, Fotos, Vorrat,
    -- Gewichte, Medikamente und der Chat.
    FOR bezug IN
      SELECT c.conrelid::regclass AS tabelle, a.attname AS spalte
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.confrelid = 'cats'::regclass AND c.contype = 'f'
    LOOP
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', bezug.tabelle, bezug.spalte, bezug.spalte)
        USING behalten, weg;
    END LOOP;

    -- Die Katzen-Markierung an Fotos ist ein Feld mit mehreren Werten und
    -- hat deshalb keinen Fremdschlüssel. Doppelte Einträge vermeiden.
    UPDATE photos
    SET cat_ids = (
      SELECT array_agg(DISTINCT CASE WHEN x = weg THEN behalten ELSE x END)
      FROM unnest(cat_ids) AS x
    )
    WHERE cat_ids @> ARRAY[weg];

    DELETE FROM cats WHERE id = weg;
  END LOOP;
END $$;

-- Zweiter Weg zu Dubletten, noch offen: Die Katzen-Tabelle ist auf den
-- Besitzer beschränkt, während Vorrat und Fotos seit Migration 006/007 dem
-- ganzen Haushalt gehören. Meldet sich Eva oder Marion an, sieht sie keine
-- Katze – und das Dashboard legt ihr eine eigene an. Die App hat keine
-- öffentliche Anmeldung; alle eingeladenen Nutzer teilen sich denselben
-- Haushalt und sollen dieselben Katzen sehen.
DO $$ BEGIN
  CREATE POLICY "Haushalt liest Katzen" ON cats
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt aendert Katzen" ON cats
    FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Eigene Katzen lesen" ON cats;
DROP POLICY IF EXISTS "Eigene Katze aktualisieren" ON cats;

-- Zum Nachsehen im Protokoll: Was steht danach noch drin?
SELECT
  c.id, c.name, c.owner_id, c.created_at,
  (SELECT count(*) FROM feeding_logs f WHERE f.cat_id = c.id) AS fuetterungen,
  (SELECT count(*) FROM health_logs  h WHERE h.cat_id = c.id) AS befinden,
  (SELECT count(*) FROM photos       p WHERE p.cat_ids @> ARRAY[c.id]) AS fotos_markiert,
  (SELECT count(*) FROM pantry_items v WHERE v.cat_id = c.id) AS vorrat
FROM cats c
ORDER BY c.name, c.created_at;

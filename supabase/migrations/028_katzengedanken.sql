-- Was die Katzen über gestern denken.
--
-- Ein Satz je Stimme und Tag, aus den echten Daten des Vortags gebaut und von
-- der KI in Ton gesetzt. Gespeichert statt bei jedem Seitenaufruf neu erzeugt,
-- und zwar aus drei Gründen: Es kostet sonst bei jedem Blick eine Anfrage, der
-- Text würde sich bei jedem Neuladen ändern (und damit seinen Reiz verlieren),
-- und so entsteht nebenbei ein Archiv zum Zurückblättern.
--
-- stimme: 'joschi', 'bella' oder 'beide'. Nicht als Verweis auf cats, weil
-- 'beide' keine Katze ist – und weil ein Gedanke von gestern erhalten bleiben
-- soll, auch wenn an den Katzenzeilen etwas passiert.

CREATE TABLE IF NOT EXISTS cat_thoughts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag        date NOT NULL,
  stimme     text NOT NULL,
  text       text NOT NULL,
  -- Womit gearbeitet wurde. Ohne diese Notiz ließe sich später nicht
  -- nachvollziehen, warum ein Gedanke so ausfiel, wie er ausfiel.
  grundlage  text,
  -- Das Bild, über das gesprochen wird. Die KI bekommt es zu sehen, und die
  -- Karte zeigt es daneben – ohne das Foto verlöre der Satz seinen Bezug.
  foto_id    uuid REFERENCES photos(id) ON DELETE SET NULL,
  foto_url   text,
  erzeugt_von text NOT NULL DEFAULT 'ki',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag, stimme)
);

DO $$ BEGIN
  ALTER TABLE cat_thoughts ADD CONSTRAINT cat_thoughts_stimme_check
    CHECK (stimme IN ('joschi', 'bella', 'beide'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cat_thoughts ADD CONSTRAINT cat_thoughts_quelle_check
    CHECK (erzeugt_von IN ('ki', 'ersatz'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS cat_thoughts_tag_idx ON cat_thoughts (tag DESC);

ALTER TABLE cat_thoughts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Haushalt liest Gedanken" ON cat_thoughts
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

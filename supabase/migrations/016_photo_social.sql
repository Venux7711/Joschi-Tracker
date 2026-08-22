-- Reaktionen und Kommentare zu Fotos.
--
-- Gemeinsame Bibliothek, gemeinsamer Haushalt: Jeder eingeladene Nutzer darf
-- alles sehen und reagieren. Eigene Beiträge darf man ändern und löschen,
-- fremde nicht. (idempotent)

CREATE TABLE IF NOT EXISTS photo_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id   uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Eine Person, ein Emoji, ein Foto – nochmal tippen nimmt zurück
  UNIQUE (photo_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS photo_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id   uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text       text NOT NULL CHECK (length(trim(text)) > 0 AND length(text) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photo_reactions_photo_idx ON photo_reactions (photo_id);
CREATE INDEX IF NOT EXISTS photo_comments_photo_idx  ON photo_comments (photo_id, created_at);

ALTER TABLE photo_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_comments  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Haushalt liest Reaktionen" ON photo_reactions
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Reaktion anlegen" ON photo_reactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Reaktion loeschen" ON photo_reactions
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt liest Kommentare" ON photo_comments
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Eigenen Kommentar anlegen" ON photo_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Eigenen Kommentar loeschen" ON photo_comments
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

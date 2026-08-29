-- Auf Kommentare reagieren, nicht nur auf das Bild.
--
-- Eigene Tabelle statt einer weiteren Spalte in photo_reactions: Dort hängt
-- alles an photo_id mit Fremdschlüssel, und ein Eintrag, der wahlweise auf ein
-- Foto oder einen Kommentar zeigt, ließe sich nicht mehr sauber absichern.
--
-- Dieselbe Regel wie beim Bild: eine Person, ein Emoji, ein Kommentar –
-- nochmal tippen nimmt zurück. (idempotent)

CREATE TABLE IF NOT EXISTS comment_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES photo_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS comment_reactions_comment_idx ON comment_reactions (comment_id);

ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Haushalt liest Kommentar-Reaktionen" ON comment_reactions
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Kommentar-Reaktion anlegen" ON comment_reactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Eigene Kommentar-Reaktion loeschen" ON comment_reactions
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

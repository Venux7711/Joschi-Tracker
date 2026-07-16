-- KI-Chat: Konversationsverlauf + gelerntes Wissen (idempotent)

-- TABELLE: ai_memories – Fakten & Verhaltensregeln, die der Nutzer der KI beibringt
DO $$ BEGIN
  CREATE TYPE ai_memory_kind AS ENUM ('fact', 'instruction');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ai_memories (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cat_id     UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       ai_memory_kind NOT NULL DEFAULT 'fact',
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_memories_cat ON ai_memories (cat_id, created_at DESC);

ALTER TABLE ai_memories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Eigenes Wissen lesen" ON ai_memories FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigenes Wissen anlegen" ON ai_memories FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigenes Wissen loeschen" ON ai_memories FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- TABELLE: chat_messages – Verlauf der Unterhaltung mit der KI
DO $$ BEGIN
  CREATE TYPE chat_role AS ENUM ('user', 'assistant');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cat_id     UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       chat_role NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_cat ON chat_messages (cat_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Eigenen Chat lesen" ON chat_messages FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigenen Chat schreiben" ON chat_messages FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Eigenen Chat loeschen" ON chat_messages FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

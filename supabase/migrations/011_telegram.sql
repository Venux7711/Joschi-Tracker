-- Telegram-Anbindung: EIN Bot, der an mehrere Chats schickt (Maik, Eva, Mama),
-- jeder Chat mit eigener Auswahl, welche Meldungen er bekommt.
--
-- Zwei Tabellen statt einer, weil das Bot-Token genau einmal existiert und
-- ein Geheimnis ist, die Empfänger aber beliebig viele sind.

-- ── Bot ──────────────────────────────────────────────────────────────────────
-- Das Token liegt hier, damit es in den App-Einstellungen änderbar ist. Es wird
-- NIE an den Browser ausgeliefert: Die API gibt nur zurück, ob eins gesetzt ist,
-- und die Policies unten erlauben nur der service_role den Lesezugriff.
CREATE TABLE IF NOT EXISTS telegram_bot (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),  -- erzwingt genau eine Zeile
  token         text NOT NULL,
  bot_username  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE telegram_bot ENABLE ROW LEVEL SECURITY;
-- Bewusst KEINE Policy: Damit kommt kein angemeldeter Nutzer über den Browser
-- an das Token. Die Server-Routen nutzen den service_role-Key und umgehen RLS.

-- ── Empfänger ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_chats (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id      text NOT NULL UNIQUE,
  label        text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  -- Welche Meldungen dieser Chat bekommt. Schlüssel siehe lib/telegram.ts.
  topics       text[] NOT NULL DEFAULT ARRAY['reminder','morning','pantry','diarrhea','birthday'],
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);

ALTER TABLE telegram_chats ENABLE ROW LEVEL SECURITY;

-- Empfänger sind kein Geheimnis – Haushalt darf sie sehen und pflegen
DO $$ BEGIN
  CREATE POLICY "Haushalt liest Telegram-Chats" ON telegram_chats
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt legt Telegram-Chats an" ON telegram_chats
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt aendert Telegram-Chats" ON telegram_chats
    FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Haushalt loescht Telegram-Chats" ON telegram_chats
    FOR DELETE USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Versand-Protokoll ────────────────────────────────────────────────────────
-- Verhindert Doppelmeldungen: Der Cron läuft mehrmals, jede Meldung soll pro
-- Chat und Tag aber nur einmal rausgehen.
CREATE TABLE IF NOT EXISTS telegram_sent (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id  text NOT NULL,
  topic    text NOT NULL,
  day      date NOT NULL,
  sent_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, topic, day)
);

ALTER TABLE telegram_sent ENABLE ROW LEVEL SECURITY;
-- Keine Policy: rein serverseitig.

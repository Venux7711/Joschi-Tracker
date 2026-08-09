-- Push kann jetzt dasselbe wie Telegram: pro Gerät wählbar, welche Meldungen
-- ankommen. Vorher gab es nur die eine Morgenzusammenfassung für alle.
--
-- Die Themen hängen am Gerät (Abo), nicht am Nutzer: Auf dem Handy will man
-- vielleicht die Erinnerung, auf dem iPad nicht. (idempotent)

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL
    DEFAULT ARRAY['reminder','health','morning','pantry','diarrhea','birthday'];

-- Zur Unterscheidung mehrerer Geräte in den Einstellungen
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS label text;

-- Bestehende Abos bekommen alle Themen (bisher gab es faktisch nur "morning")
UPDATE push_subscriptions
SET topics = ARRAY['reminder','health','morning','pantry','diarrhea','birthday']
WHERE topics IS NULL OR cardinality(topics) = 0;

-- ── Versand-Protokoll, kanalübergreifend ─────────────────────────────────────
-- Ersetzt telegram_sent: dieselbe Aufgabe (eine Meldung pro Empfänger, Thema
-- und Tag), jetzt für Push und Telegram gemeinsam.
CREATE TABLE IF NOT EXISTS notifications_sent (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel    text NOT NULL,            -- 'push' | 'telegram'
  recipient  text NOT NULL,            -- Endpoint bzw. Chat-ID
  topic      text NOT NULL,
  day        date NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, recipient, topic, day)
);

ALTER TABLE notifications_sent ENABLE ROW LEVEL SECURITY;
-- Keine Policy: rein serverseitig, wie zuvor telegram_sent.

DROP TABLE IF EXISTS telegram_sent;

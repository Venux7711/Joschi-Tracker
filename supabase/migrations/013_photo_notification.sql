-- Neues Thema "photo": Meldung, sobald jemand ein Foto hinzufügt.
--
-- Anders als die übrigen Themen hängt es nicht am Cron, sondern wird direkt
-- beim Hochladen ausgelöst. Bestehende Empfänger bekommen es dazu – wer es
-- nicht will, schaltet es in den Einstellungen ab. (idempotent)

ALTER TABLE push_subscriptions
  ALTER COLUMN topics SET DEFAULT ARRAY['reminder','health','morning','pantry','diarrhea','birthday','photo'];

ALTER TABLE telegram_chats
  ALTER COLUMN topics SET DEFAULT ARRAY['reminder','health','morning','pantry','diarrhea','birthday','photo'];

UPDATE push_subscriptions SET topics = topics || ARRAY['photo']
WHERE NOT ('photo' = ANY(topics));

UPDATE telegram_chats SET topics = topics || ARRAY['photo']
WHERE NOT ('photo' = ANY(topics));

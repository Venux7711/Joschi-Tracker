-- Was der Mensch weiß, die App aber nie sehen kann.
--
-- "Bella hasst den Staubsauger" steht auf keinem Foto und in keiner
-- Fütterungszeile. Solche Angaben sind trotzdem das wertvollste Wissen über
-- die beiden – und bislang gab es keinen Weg, sie einzutragen. Korrigieren
-- ließ sich nur, was die App von selbst beobachtet hatte.
--
-- Eigene Art statt eines Vermerks an einer beobachteten Erinnerung: Eine
-- Nutzerangabe ist keine Beobachtung mit hoher Zuversicht, sondern etwas
-- kategorisch anderes. Sie braucht keinen Beleg aus Fotos, sie veraltet nicht
-- von selbst, und sie darf von keiner Beobachtung abgewertet werden. Das
-- sichtbar zu trennen ist auch für den Menschen ehrlicher: Er soll erkennen
-- können, was die App selbst gefolgert hat und was er ihr gesagt hat.
--
-- Abzugrenzen von ai_memories: Das sind Anweisungen und Fakten für den Chat.
-- Hier steht Wissen über die Katzen, das in die Gedanken einfließt.

DO $$ BEGIN
  ALTER TABLE cat_memories DROP CONSTRAINT IF EXISTS cat_memories_type_check;
  ALTER TABLE cat_memories ADD CONSTRAINT cat_memories_type_check
    CHECK (memory_type IN (
      'fact', 'observation', 'event', 'milestone', 'preference',
      'pattern', 'running_gag', 'relationship', 'temporal_pattern',
      'user_fact'
    ));
END $$;

DO $$ BEGIN
  ALTER TABLE cat_memories DROP CONSTRAINT IF EXISTS cat_memories_status_check;
  ALTER TABLE cat_memories ADD CONSTRAINT cat_memories_status_check
    CHECK (status IN ('tentative', 'active', 'stale', 'superseded', 'user_confirmed'));
END $$;

-- Eingetragen wird über die Anwendung mit dem Dienstschlüssel; gelesen von
-- allen im Haushalt. Die Lese-Regel besteht bereits.

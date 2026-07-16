-- Mehrere Katzen: Profildaten wandern von einer hart codierten Konstante im
-- Code direkt an die jeweilige Katze (idempotent).

ALTER TABLE cats ADD COLUMN IF NOT EXISTS breed TEXT;
ALTER TABLE cats ADD COLUMN IF NOT EXISTS coat TEXT;
ALTER TABLE cats ADD COLUMN IF NOT EXISTS condition TEXT;
ALTER TABLE cats ADD COLUMN IF NOT EXISTS description_accusative TEXT;
ALTER TABLE cats ADD COLUMN IF NOT EXISTS breed_label TEXT;
ALTER TABLE cats ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'amber';
ALTER TABLE cats ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Joschis bisher hart codiertes Profil (aus lib/cat-profile.ts) nachtragen
UPDATE cats SET
  breed = 'Britisch Langhaar',
  coat = 'golden',
  condition = 'Rezidivierender Durchfall',
  description_accusative = 'einen goldenen Britisch-Langhaar-Kater (British Longhair)',
  breed_label = 'Britisch Langhaar (golden)',
  theme = 'amber',
  photo_url = '/joschi.jpg'
WHERE name = 'Joschi' AND breed IS NULL;

-- Bella anlegen (gleicher Besitzer wie Joschi), falls noch nicht vorhanden
INSERT INTO cats (name, owner_id, breed, coat, condition, description_accusative, breed_label, theme, photo_url)
SELECT
  'Bella', owner_id,
  'Britisch Kurzhaar', 'silver tabby', 'Bisher keine bekannten Beschwerden',
  'eine silberne Britisch-Kurzhaar-Kätzin (British Shorthair) mit Tabby-Zeichnung',
  'Britisch Kurzhaar (Silver Tabby)', 'silver', '/bella.jpg'
FROM cats
WHERE name = 'Joschi'
  AND NOT EXISTS (SELECT 1 FROM cats WHERE name = 'Bella')
LIMIT 1;

-- Pantry: Produkt-URL + Nährwertdaten (idempotent)
ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS product_url TEXT;
ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS nutrition JSONB;

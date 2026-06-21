-- Photos table for Joschi Tracker
CREATE TABLE IF NOT EXISTS photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cat_id uuid REFERENCES cats(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  health_log_id uuid REFERENCES health_logs(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  mood_tag text DEFAULT 'normal',
  caption text,
  taken_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read photos" ON photos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Auth users insert photos" ON photos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Auth users delete photos" ON photos
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE gd_sessions
  ADD COLUMN IF NOT EXISTS creator_name TEXT;

ALTER TABLE gd_participants
  ADD COLUMN IF NOT EXISTS participant_name TEXT,
  ADD COLUMN IF NOT EXISTS participant_roll TEXT,
  ADD COLUMN IF NOT EXISTS participant_programme TEXT;

-- Allow public read on participants (to show participant lists)
DROP POLICY IF EXISTS "gd_participants_select" ON gd_participants;
CREATE POLICY "gd_participants_select" ON gd_participants FOR SELECT USING (true);

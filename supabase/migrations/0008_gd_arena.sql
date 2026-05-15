-- GD Arena: Group Discussion sessions and participants

CREATE TABLE IF NOT EXISTS gd_sessions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic          TEXT NOT NULL,
  description    TEXT,
  programme      TEXT NOT NULL DEFAULT 'bda',
  status         TEXT NOT NULL DEFAULT 'waiting'
                   CHECK (status IN ('waiting', 'active', 'ended')),
  created_by     UUID,
  moderator_id   UUID,
  room_url       TEXT,
  room_name      TEXT,
  max_participants INT NOT NULL DEFAULT 11,
  participant_count INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gd_participants (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES gd_sessions(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  role       TEXT NOT NULL DEFAULT 'participant'
               CHECK (role IN ('participant', 'moderator')),
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  left_at    TIMESTAMPTZ,
  UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gd_sessions_programme_status
  ON gd_sessions(programme, status);

CREATE INDEX IF NOT EXISTS idx_gd_participants_session
  ON gd_participants(session_id) WHERE left_at IS NULL;

-- RLS
ALTER TABLE gd_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gd_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gd_sessions_select"  ON gd_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "gd_sessions_insert"  ON gd_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gd_sessions_update"  ON gd_sessions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "gd_participants_select" ON gd_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "gd_participants_insert" ON gd_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "gd_participants_update" ON gd_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

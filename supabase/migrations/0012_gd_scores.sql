CREATE TABLE IF NOT EXISTS gd_session_scores (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id          UUID        REFERENCES gd_sessions(id) ON DELETE SET NULL,
  programme           TEXT        NOT NULL DEFAULT 'bda',
  confidence_score    INT,
  wpm                 INT,
  participation_pct   INT,
  speaking_turns      INT,
  vocabulary_richness INT,
  interruptions       INT         DEFAULT 0,
  elapsed_ms          BIGINT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gd_session_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gd_scores_insert" ON gd_session_scores
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "gd_scores_select" ON gd_session_scores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

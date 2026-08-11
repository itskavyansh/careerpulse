-- ============================================================================
-- CareerPulse Phase 6 — Applications Table
-- ============================================================================

-- ─── 5. applications ────────────────────────────────────────────────────────
-- Tracks the user's application status for specific jobs.

CREATE TABLE applications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id     uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status     text        NOT NULL CHECK (status IN ('applied', 'interviewing', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- A user can only have ONE tracked status per job at a time.
  CONSTRAINT applications_user_job_unique UNIQUE (user_id, job_id)
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- ─── applications policies ──────────────────────────────────────────────────

-- Any logged-in user can READ only their own applications.
CREATE POLICY "Users can read own applications"
  ON applications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- A user can insert applications, but only for themselves.
CREATE POLICY "Users can create own applications"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- A user can update their applications, but only if they own them.
CREATE POLICY "Users can update own applications"
  ON applications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- A user can delete their applications, but only if they own them.
CREATE POLICY "Users can delete own applications"
  ON applications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- CareerPulse Phase 7 — Company Views Last Seen
-- Paste this entire file into the Supabase SQL Editor and click "Run".
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_views (
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    last_viewed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, company_id)
);

-- Enable RLS
ALTER TABLE company_views ENABLE ROW LEVEL SECURITY;

-- Users can read their own views
CREATE POLICY "Users can read own company_views"
  ON company_views FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert/update their own views
CREATE POLICY "Users can update own company_views"
  ON company_views FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can modify own company_views"
  ON company_views FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

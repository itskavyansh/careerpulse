-- ============================================================================
-- CareerPulse Phase 1 — Supabase Schema
-- Paste this entire file into the Supabase SQL Editor and click "Run".
-- ============================================================================

-- ─── 1. companies ───────────────────────────────────────────────────────────────
-- Stores each company we track, along with which ATS platform was detected
-- and how we detected it.

CREATE TABLE companies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  careers_url      text        NOT NULL,

  -- Which ATS platform powers this company's job board (or 'none' if unknown)
  detected_platform text       CHECK (detected_platform IN (
                                 'greenhouse', 'lever', 'ashby',
                                 'smartrecruiters', 'none'
                               )),

  -- The confirmed working slug/token for this company on its ATS
  -- e.g. "stripe" on Greenhouse. NULL if platform is 'none'.
  platform_slug    text,

  -- How we found the platform: 'direct_url' (URL matched an ATS pattern),
  -- 'guess_verify' (generated candidate slugs and probed), 'homepage_scan'
  -- (regex'd careers page HTML), or NULL (fallback / not detected).
  detection_method text        CHECK (detection_method IN (
                                 'direct_url', 'guess_verify', 'homepage_scan'
                               ) OR detection_method IS NULL),

  last_scraped_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- For now, company names are unique enough to key on.
  CONSTRAINT companies_name_unique UNIQUE (name)
);

-- ─── 2. jobs ────────────────────────────────────────────────────────────────────
-- Stores individual job postings linked to a company. We never hard-delete
-- jobs — instead we set is_active = false when a job disappears from a scrape,
-- so users can still see historical postings.

CREATE TABLE jobs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- The job's native ID from the source ATS (if available).
  -- Helps with more reliable diffing but not every ATS provides one.
  external_id    text,

  title          text        NOT NULL,
  location       text,
  department     text,
  url            text        NOT NULL,  -- the apply/detail link
  posted_date    timestamptz,

  -- When OUR system first discovered this job.
  first_seen_at  timestamptz NOT NULL DEFAULT now(),

  -- Updated every time we see this job in a scrape. If this falls behind
  -- the latest scrape timestamp, the job has likely been taken down.
  last_seen_at   timestamptz NOT NULL DEFAULT now(),

  -- Soft delete: set to false when a previously-seen job no longer appears
  -- in a scrape. Re-set to true if the job reappears.
  is_active      boolean     NOT NULL DEFAULT true,

  -- Primary dedup key: same company + same URL = same job.
  -- We use URL rather than external_id because not every ATS gives clean IDs.
  CONSTRAINT jobs_company_url_unique UNIQUE (company_id, url)
);

-- ─── 3. profiles ────────────────────────────────────────────────────────────────
-- Minimal extension of Supabase's built-in auth.users. We create a row here
-- for each authenticated user so we can hang subscriptions and future
-- preferences off it. The id is the SAME uuid as auth.users.id.

CREATE TABLE profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. subscriptions ───────────────────────────────────────────────────────────
-- Tracks which users are following which companies. A user subscribing to a
-- company means they want to be notified about new/removed jobs.

CREATE TABLE subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- A user can't subscribe to the same company twice.
  CONSTRAINT subscriptions_user_company_unique UNIQUE (user_id, company_id)
);


-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on every table. With RLS on, NO rows are accessible unless
-- an explicit policy grants access.

ALTER TABLE companies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ─── companies policies ─────────────────────────────────────────────────────────

-- Any logged-in user can READ company data (browse the company list,
-- see which platform was detected, etc.).
CREATE POLICY "Authenticated users can read companies"
  ON companies FOR SELECT
  TO authenticated
  USING (true);

-- Regular users CANNOT insert/update/delete companies. Only our backend
-- scraping script (which uses the service_role key, bypassing RLS) can
-- write to this table. No INSERT/UPDATE/DELETE policies needed.

-- ─── jobs policies ──────────────────────────────────────────────────────────────

-- Any logged-in user can READ job listings.
CREATE POLICY "Authenticated users can read jobs"
  ON jobs FOR SELECT
  TO authenticated
  USING (true);

-- Like companies, jobs are only written by our backend script via
-- service_role. No INSERT/UPDATE/DELETE policies for regular users.

-- ─── profiles policies ─────────────────────────────────────────────────────────

-- A user can only read their OWN profile row.
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- A user can only update their OWN profile row.
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─── subscriptions policies ─────────────────────────────────────────────────────

-- A user can only see their OWN subscriptions.
CREATE POLICY "Users can read own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- A user can subscribe to a company (insert), but only for themselves.
-- The user_id in the new row must match the logged-in user's ID.
CREATE POLICY "Users can create own subscriptions"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- A user can unsubscribe (delete), but only their own subscriptions.
CREATE POLICY "Users can delete own subscriptions"
  ON subscriptions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

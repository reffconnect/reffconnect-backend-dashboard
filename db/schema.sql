-- ConnectX standalone backend — database schema
-- =============================================================================
-- This schema belongs to the standalone API backend ONLY. It is intentionally
-- independent of the Supabase project the current app uses. Authorization is
-- enforced in the service layer (not via RLS), because this backend connects
-- with a single trusted role.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / guarded DO).
-- Shapes for categories/jobs/job_applications mirror my-app migration 067 so a
-- future frontend switch is friction-free.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- provides gen_random_uuid()

-- Shared "touch updated_at" trigger function.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 1. users — authentication identities (replaces Supabase auth.users)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  password_hash  TEXT,                       -- NULL for pure OAuth accounts
  auth_provider  TEXT NOT NULL DEFAULT 'local',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_login     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_auth_provider_valid CHECK (auth_provider IN ('local', 'google', 'linkedin'))
);

-- Case-insensitive unique email.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON public.users (lower(email));

DROP TRIGGER IF EXISTS trg_users_touch ON public.users;
CREATE TRIGGER trg_users_touch
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 2. refresh_tokens — server-side handle for rotation/revocation
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,                 -- sha256 of the JWT; raw token never stored
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON public.refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON public.refresh_tokens (expires_at);

-- ─────────────────────────────────────────────────────────────────────
-- 3. profiles — 1:1 with users (mirrors database.types.ts Profile)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                      UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  full_name               TEXT NOT NULL DEFAULT '',
  primary_email           TEXT NOT NULL,
  office_email            TEXT,
  office_email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  office_email_verified_at TIMESTAMPTZ,
  mobile_number           TEXT,
  designation             TEXT,
  company_name            TEXT,
  location                TEXT,
  role                    TEXT NOT NULL DEFAULT 'job_seeker',
  auth_provider           TEXT NOT NULL DEFAULT 'local',
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified             BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified          BOOLEAN NOT NULL DEFAULT FALSE,
  profile_picture         TEXT,
  linkedin_url            TEXT,
  github_link             TEXT,
  portfolio_url           TEXT,
  bio                     TEXT,
  skills                  TEXT[],
  preferred_locations     TEXT[],
  availability_status     TEXT,
  notice_period           TEXT,
  work_modes              TEXT[],
  industry                TEXT,
  languages               TEXT,
  years_of_experience     TEXT,
  education_entries       JSONB NOT NULL DEFAULT '[]'::jsonb,
  project_entries         JSONB NOT NULL DEFAULT '[]'::jsonb,
  certification_entries   JSONB NOT NULL DEFAULT '[]'::jsonb,
  work_history_entries    JSONB NOT NULL DEFAULT '[]'::jsonb,
  achievement_entries     JSONB NOT NULL DEFAULT '[]'::jsonb,
  hobbies                 TEXT[],
  verified_company_domain TEXT,
  jobseeker_profile       JSONB,
  rating                  NUMERIC(3, 2),
  reviews_count           INTEGER NOT NULL DEFAULT 0,
  user_code               TEXT,
  last_login              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_role_valid CHECK (role IN ('job_seeker', 'referrer', 'admin'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_user_code
  ON public.profiles (user_code) WHERE user_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

DROP TRIGGER IF EXISTS trg_profiles_touch ON public.profiles;
CREATE TRIGGER trg_profiles_touch
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 4. categories — reference data (mirrors migration 067)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_name ON public.categories (lower(name));

INSERT INTO public.categories (name, description, icon, is_active) VALUES
  ('Software Engineering', 'Backend, frontend, full-stack and mobile engineering roles', 'code',        TRUE),
  ('Data & Analytics',     'Data science, data engineering, analytics and ML roles',      'bar-chart',   TRUE),
  ('DevOps & Cloud',       'Infrastructure, SRE, platform and cloud roles',               'server',      TRUE),
  ('Product Management',   'Product managers and product owners',                         'layers',      TRUE),
  ('Design',               'Product, UX, UI and graphic design roles',                    'pen-tool',    TRUE),
  ('Marketing',            'Growth, content, brand and performance marketing',            'megaphone',   TRUE),
  ('Sales & Business',     'Sales, business development and partnerships',                'trending-up', TRUE),
  ('Operations',           'Operations, program and project management',                  'settings',    TRUE),
  ('Finance & Accounting', 'Finance, accounting and audit roles',                         'dollar-sign', TRUE),
  ('Human Resources',      'Recruiting, people operations and HR roles',                  'users',       TRUE),
  ('Customer Success',     'Support, customer success and account management',            'headphones',  TRUE),
  ('Other',                'Roles that do not fit the categories above',                  'briefcase',   TRUE)
ON CONFLICT (lower(name)) DO NOTHING;

DROP TRIGGER IF EXISTS trg_categories_touch ON public.categories;
CREATE TRIGGER trg_categories_touch
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 5. jobs — a posting created by a working professional (referrer)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id                 BIGSERIAL PRIMARY KEY,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL,
  company_name       TEXT NOT NULL,
  location           TEXT NOT NULL DEFAULT '',
  job_type           TEXT NOT NULL DEFAULT 'full_time',
  experience_level   TEXT NOT NULL DEFAULT 'entry',
  work_mode          TEXT NOT NULL DEFAULT 'onsite',
  status             TEXT NOT NULL DEFAULT 'active',
  salary_min         INTEGER,
  salary_max         INTEGER,
  currency           TEXT NOT NULL DEFAULT 'INR',
  skills_required    TEXT,
  experience_years   INTEGER NOT NULL DEFAULT 0,
  contact_email      TEXT,
  application_url    TEXT,
  is_featured        BOOLEAN NOT NULL DEFAULT FALSE,
  views_count        INTEGER NOT NULL DEFAULT 0,
  applications_count INTEGER NOT NULL DEFAULT 0,
  requirements       TEXT,
  benefits           TEXT,
  expires_at         TIMESTAMPTZ,
  category_id        BIGINT REFERENCES public.categories(id) ON DELETE SET NULL,
  posted_by          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jobs_job_type_valid CHECK (
    job_type IN ('full_time', 'part_time', 'contract', 'internship', 'freelance')
  ),
  CONSTRAINT jobs_experience_level_valid CHECK (
    experience_level IN ('entry', 'mid', 'senior', 'executive')
  ),
  CONSTRAINT jobs_work_mode_valid CHECK (work_mode IN ('remote', 'onsite', 'hybrid')),
  CONSTRAINT jobs_status_valid CHECK (status IN ('active', 'closed', 'draft', 'paused')),
  CONSTRAINT jobs_salary_range_valid CHECK (
    salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min
  )
);

CREATE INDEX IF NOT EXISTS idx_jobs_posted_by  ON public.jobs (posted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status     ON public.jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_category   ON public.jobs (category_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_featured   ON public.jobs (is_featured) WHERE is_featured = TRUE;

DROP TRIGGER IF EXISTS trg_jobs_touch ON public.jobs;
CREATE TRIGGER trg_jobs_touch
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 6. job_applications — a seeker applies to a posting (mirrors migration 067)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_applications (
  id         BIGSERIAL PRIMARY KEY,
  job_id     BIGINT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'applied',
  cover_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_applications_status_valid CHECK (
    status IN ('applied', 'reviewing', 'shortlisted', 'rejected', 'hired', 'withdrawn')
  ),
  CONSTRAINT uq_job_applications_job_user UNIQUE (job_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_job  ON public.job_applications (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_applications_user ON public.job_applications (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_job_applications_touch ON public.job_applications;
CREATE TRIGGER trg_job_applications_touch
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Keep jobs.applications_count in sync.
CREATE OR REPLACE FUNCTION public.job_applications_maintain_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.jobs SET applications_count = applications_count + 1 WHERE id = NEW.job_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.jobs SET applications_count = GREATEST(0, applications_count - 1) WHERE id = OLD.job_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_applications_count ON public.job_applications;
CREATE TRIGGER trg_job_applications_count
  AFTER INSERT OR DELETE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.job_applications_maintain_count();

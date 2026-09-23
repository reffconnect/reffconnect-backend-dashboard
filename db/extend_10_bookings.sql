-- ConnectX backend — bookings + marketplace extension
-- =============================================================================
-- Adds the tables behind onboarding, services/pricing, the referrer marketplace,
-- reservations, the three request types (referral / resume-review / mock),
-- their sessions, ratings, notes, referrer upgrades, success stories, events,
-- and ingested external jobs. Shapes mirror the record interfaces in api.ts.
--
-- Idempotent. Depends on schema.sql (public.users, public.profiles,
-- public.touch_updated_at). Applied after schema.sql by the migrate runner.
-- =============================================================================

-- Profile columns the onboarding flow writes that aren't in the core schema.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_type       TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consented_at    TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consent_version TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_adult        BOOLEAN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS utm_source      TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS utm_medium      TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS utm_campaign    TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ref_code        TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_preset   TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- verified_work_emails — OTP-proven company email (employment proof)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.verified_work_emails (
  user_id         UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  email_domain    TEXT NOT NULL,
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_verified_work_emails_email ON public.verified_work_emails (lower(email));

-- ─────────────────────────────────────────────────────────────────────
-- user_onboarding — one row per user
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  aadhaar_number            TEXT,
  pan_number                TEXT,
  github_link               TEXT,
  linkedin_profile_link     TEXT,
  country                   TEXT,
  state                     TEXT,
  city                      TEXT,
  contact_number            TEXT,
  company_name              TEXT,
  company_email             TEXT,
  company_email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  company_email_verified_at TIMESTAMPTZ,
  user_type                 TEXT,
  verification_status       TEXT,
  admin_notes               TEXT,
  completed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_onboarding_verification_status_valid
    CHECK (verification_status IS NULL OR verification_status IN ('pending', 'approved', 'rejected'))
);
DROP TRIGGER IF EXISTS trg_user_onboarding_touch ON public.user_onboarding;
CREATE TRIGGER trg_user_onboarding_touch BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- platform_features — feature flags
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_features (
  feature_key TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
-- service_configurations — a referrer's per-service pricing + availability
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_configurations (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  service_id   TEXT NOT NULL,
  availability JSONB NOT NULL DEFAULT '{}'::jsonb,
  price        INTEGER,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_service_config_user_service UNIQUE (user_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_service_config_service ON public.service_configurations (service_id, is_active);
DROP TRIGGER IF EXISTS trg_service_config_touch ON public.service_configurations;
CREATE TRIGGER trg_service_config_touch BEFORE UPDATE ON public.service_configurations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- slot_reservations — short-lived checkout locks on a referrer's slot
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.slot_reservations (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  service_id  TEXT NOT NULL,
  slot_label  TEXT NOT NULL,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  is_released BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_slot_reservation UNIQUE (referrer_id, service_id, slot_label)
);
CREATE INDEX IF NOT EXISTS idx_slot_reservations_referrer ON public.slot_reservations (referrer_id, is_released, expires_at);

-- ─────────────────────────────────────────────────────────────────────
-- referral_requests
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_requests (
  id                        BIGSERIAL PRIMARY KEY,
  requester_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requester_name            TEXT NOT NULL DEFAULT '',
  referrer_id               UUID REFERENCES public.users(id) ON DELETE SET NULL,
  referrer_name             TEXT NOT NULL,
  referrer_company          TEXT NOT NULL,
  referrer_title            TEXT,
  job_url                   TEXT,
  job_title                 TEXT,
  role_type                 TEXT,
  message_template          TEXT,
  personal_message          TEXT NOT NULL DEFAULT '',
  technical_skills          TEXT,
  experience_level          TEXT,
  priority                  TEXT NOT NULL DEFAULT 'medium',
  resume_file_name          TEXT,
  resume_file_path          TEXT,
  preferred_day             TEXT,
  preferred_time            TEXT,
  preferred_timezone        TEXT,
  requested_duration_minutes INTEGER,
  status                    TEXT NOT NULL DEFAULT 'pending',
  gross_amount              INTEGER,
  payment_order_id          UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_requests_status_valid
    CHECK (status IN ('pending', 'accepted', 'declined', 'scheduled', 'completed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_referral_requests_requester ON public.referral_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_requests_referrer  ON public.referral_requests (referrer_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_referral_requests_touch ON public.referral_requests;
CREATE TRIGGER trg_referral_requests_touch BEFORE UPDATE ON public.referral_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- resume_review_requests
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resume_review_requests (
  id                   BIGSERIAL PRIMARY KEY,
  requester_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requester_name       TEXT NOT NULL DEFAULT '',
  referrer_id          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  referrer_name        TEXT NOT NULL,
  referrer_company     TEXT NOT NULL,
  referrer_title       TEXT,
  target_role          TEXT,
  focus_note           TEXT,
  jd_url               TEXT,
  resume_file_path     TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  feedback_text        TEXT,
  feedback_submitted_at TIMESTAMPTZ,
  is_rated             BOOLEAN NOT NULL DEFAULT FALSE,
  gross_amount         INTEGER,
  payment_order_id     UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT resume_review_status_valid
    CHECK (status IN ('pending', 'feedback_delivered', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_resume_review_requester ON public.resume_review_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resume_review_referrer  ON public.resume_review_requests (referrer_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_resume_review_touch ON public.resume_review_requests;
CREATE TRIGGER trg_resume_review_touch BEFORE UPDATE ON public.resume_review_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- mock_interview_requests
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mock_interview_requests (
  id                        BIGSERIAL PRIMARY KEY,
  requester_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requester_name            TEXT NOT NULL DEFAULT '',
  referrer_id               UUID REFERENCES public.users(id) ON DELETE SET NULL,
  referrer_name             TEXT NOT NULL,
  referrer_company          TEXT NOT NULL,
  referrer_title            TEXT,
  company_question          TEXT,
  focus_note                TEXT,
  preferred_day             TEXT,
  preferred_time            TEXT,
  preferred_timezone        TEXT,
  requested_duration_minutes INTEGER,
  price                     INTEGER,
  status                    TEXT NOT NULL DEFAULT 'pending',
  gross_amount              INTEGER,
  payment_order_id          UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mock_interview_status_valid
    CHECK (status IN ('pending', 'accepted', 'declined', 'scheduled', 'completed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_mock_request_requester ON public.mock_interview_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mock_request_referrer  ON public.mock_interview_requests (referrer_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_mock_request_touch ON public.mock_interview_requests;
CREATE TRIGGER trg_mock_request_touch BEFORE UPDATE ON public.mock_interview_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- referral_sessions
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_sessions (
  id               BIGSERIAL PRIMARY KEY,
  request_id       BIGINT REFERENCES public.referral_requests(id) ON DELETE SET NULL,
  requester_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referrer_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referrer_name    TEXT,
  referrer_company TEXT,
  status           TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_start  TIMESTAMPTZ NOT NULL,
  scheduled_end    TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  cancelled_at     TIMESTAMPTZ,
  cancelled_by     UUID,
  cancel_reason    TEXT,
  daily_room_name  TEXT,
  daily_room_url   TEXT,
  is_rated         BOOLEAN NOT NULL DEFAULT FALSE,
  gross_amount     INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_sessions_status_valid
    CHECK (status IN ('scheduled', 'rescheduled', 'cancelled', 'completed', 'expired'))
);
CREATE INDEX IF NOT EXISTS idx_referral_sessions_requester ON public.referral_sessions (requester_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_referral_sessions_referrer  ON public.referral_sessions (referrer_id, scheduled_start DESC);
DROP TRIGGER IF EXISTS trg_referral_sessions_touch ON public.referral_sessions;
CREATE TRIGGER trg_referral_sessions_touch BEFORE UPDATE ON public.referral_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- mock_interview_sessions
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mock_interview_sessions (
  id               BIGSERIAL PRIMARY KEY,
  request_id       BIGINT REFERENCES public.mock_interview_requests(id) ON DELETE SET NULL,
  requester_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referrer_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referrer_name    TEXT,
  referrer_company TEXT,
  status           TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_start  TIMESTAMPTZ NOT NULL,
  scheduled_end    TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  cancelled_at     TIMESTAMPTZ,
  cancelled_by     UUID,
  cancel_reason    TEXT,
  daily_room_name  TEXT,
  daily_room_url   TEXT,
  is_rated         BOOLEAN NOT NULL DEFAULT FALSE,
  gross_amount     INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mock_sessions_status_valid
    CHECK (status IN ('scheduled', 'rescheduled', 'cancelled', 'completed', 'expired'))
);
CREATE INDEX IF NOT EXISTS idx_mock_sessions_requester ON public.mock_interview_sessions (requester_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_mock_sessions_referrer  ON public.mock_interview_sessions (referrer_id, scheduled_start DESC);
DROP TRIGGER IF EXISTS trg_mock_sessions_touch ON public.mock_interview_sessions;
CREATE TRIGGER trg_mock_sessions_touch BEFORE UPDATE ON public.mock_interview_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- Ratings (one per session/request, by the requester)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_session_ratings (
  id          BIGSERIAL PRIMARY KEY,
  session_id  BIGINT NOT NULL UNIQUE REFERENCES public.referral_sessions(id) ON DELETE CASCADE,
  rater_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_ratings_referrer ON public.referral_session_ratings (referrer_id);

CREATE TABLE IF NOT EXISTS public.mock_interview_session_ratings (
  id          BIGSERIAL PRIMARY KEY,
  session_id  BIGINT NOT NULL UNIQUE REFERENCES public.mock_interview_sessions(id) ON DELETE CASCADE,
  rater_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mock_ratings_referrer ON public.mock_interview_session_ratings (referrer_id);

CREATE TABLE IF NOT EXISTS public.resume_review_ratings (
  id          BIGSERIAL PRIMARY KEY,
  request_id  BIGINT NOT NULL UNIQUE REFERENCES public.resume_review_requests(id) ON DELETE CASCADE,
  rater_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resume_ratings_referrer ON public.resume_review_ratings (referrer_id);

-- ─────────────────────────────────────────────────────────────────────
-- request_notes — shared thread on a request (both parties)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.request_notes (
  id             BIGSERIAL PRIMARY KEY,
  service        TEXT NOT NULL,
  request_id     BIGINT NOT NULL,
  author_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body           TEXT NOT NULL,
  is_action_item BOOLEAN NOT NULL DEFAULT FALSE,
  is_done        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT request_notes_service_valid CHECK (service IN ('referral', 'resume_review', 'mock_interview'))
);
CREATE INDEX IF NOT EXISTS idx_request_notes_thread ON public.request_notes (service, request_id, created_at);
DROP TRIGGER IF EXISTS trg_request_notes_touch ON public.request_notes;
CREATE TRIGGER trg_request_notes_touch BEFORE UPDATE ON public.request_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- referrer_upgrade_requests + success_stories
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referrer_upgrade_requests (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_name  TEXT,
  referrer_code TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  admin_notes   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referrer_upgrade_status_valid CHECK (status IN ('pending', 'approved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS idx_referrer_upgrade_user ON public.referrer_upgrade_requests (user_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_referrer_upgrade_touch ON public.referrer_upgrade_requests;
CREATE TRIGGER trg_referrer_upgrade_touch BEFORE UPDATE ON public.referrer_upgrade_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.success_stories (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referrer_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title         TEXT,
  story_text    TEXT,
  company_name  TEXT,
  role_title    TEXT,
  is_approved   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_success_stories_referrer ON public.success_stories (referrer_id, is_approved);
DROP TRIGGER IF EXISTS trg_success_stories_touch ON public.success_stories;
CREATE TRIGGER trg_success_stories_touch BEFORE UPDATE ON public.success_stories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- user_events — analytics event log (owner-scoped)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  category   TEXT,
  ref_id     TEXT,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_events_user ON public.user_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_type ON public.user_events (event_type, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- external_jobs — ingested from company ATS/career pages
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.external_jobs (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,
  external_id     TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  company_domain  TEXT,
  title           TEXT NOT NULL,
  location        TEXT,
  department      TEXT,
  employment_type TEXT,
  is_remote       BOOLEAN NOT NULL DEFAULT FALSE,
  apply_url       TEXT,
  description     TEXT,
  posted_at       TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_external_jobs_source UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_external_jobs_company ON public.external_jobs (lower(company_name), is_active);
CREATE INDEX IF NOT EXISTS idx_external_jobs_active  ON public.external_jobs (is_active, posted_at DESC);
DROP TRIGGER IF EXISTS trg_external_jobs_touch ON public.external_jobs;
CREATE TRIGGER trg_external_jobs_touch BEFORE UPDATE ON public.external_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

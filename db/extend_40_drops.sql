-- ConnectX backend — weekly referral drops extension
-- =============================================================================
-- Weekly company "drops", candidate cards, AI screening packets, and referrer
-- preferences. Screening enrichment runs via the OpenAI adapter when configured,
-- else a deterministic fallback packet keeps the flow working.
-- Idempotent. Applied after the earlier extensions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_referral_drops (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name          TEXT NOT NULL,
  company_domain        TEXT,
  active_referrers_count INTEGER NOT NULL DEFAULT 0,
  drop_week_start       DATE NOT NULL,
  drop_week_end         DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active',
  fee_inr               NUMERIC(10, 2) NOT NULL DEFAULT 49.00,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT weekly_drops_status_valid CHECK (status IN ('active', 'closed'))
);
CREATE INDEX IF NOT EXISTS idx_weekly_drops_active ON public.weekly_referral_drops (status, drop_week_end);
-- A UNIQUE over an expression (case-insensitive company name) must be a unique
-- INDEX, not a table constraint: Postgres rejects expressions inside UNIQUE (...).
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_drop ON public.weekly_referral_drops (lower(company_name), drop_week_start);
DROP TRIGGER IF EXISTS trg_weekly_drops_touch ON public.weekly_referral_drops;
CREATE TRIGGER trg_weekly_drops_touch BEFORE UPDATE ON public.weekly_referral_drops
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.drop_card_entries (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id                  UUID REFERENCES public.weekly_referral_drops(id) ON DELETE SET NULL,
  student_user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_referrer_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  company_name             TEXT NOT NULL,
  target_job_req_id        TEXT,
  target_job_url           TEXT,
  resume_url               TEXT,
  pitch_text               TEXT,
  leetcode_url             TEXT,
  github_url               TEXT,
  project_demo_url         TEXT,
  job_description_text      TEXT,
  job_description_source    TEXT,
  ai_processing_consent_at  TIMESTAMPTZ,
  status                   TEXT NOT NULL DEFAULT 'submitted',
  screening_status         TEXT NOT NULL DEFAULT 'queued',
  hr_reference_id          TEXT,
  pass_reason              TEXT,
  candidate_question       TEXT,
  candidate_response       TEXT,
  referral_confirmed_at    TIMESTAMPTZ,
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT drop_card_status_valid CHECK (status IN ('submitted', 'in_review', 'accepted', 'passed', 'referred')),
  CONSTRAINT drop_card_screening_valid CHECK (screening_status IN ('queued', 'processing', 'completed', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_drop_cards_student  ON public.drop_card_entries (student_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drop_cards_assigned ON public.drop_card_entries (assigned_referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drop_cards_company  ON public.drop_card_entries (lower(company_name), status);
DROP TRIGGER IF EXISTS trg_drop_cards_touch ON public.drop_card_entries;
CREATE TRIGGER trg_drop_cards_touch BEFORE UPDATE ON public.drop_card_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.ai_screening_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id           UUID NOT NULL REFERENCES public.drop_card_entries(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'processing',
  processing_mode   TEXT NOT NULL DEFAULT 'ai',
  recommendation    TEXT,
  confidence        TEXT,
  summary           TEXT,
  why_refer         JSONB NOT NULL DEFAULT '[]'::jsonb,
  what_to_verify    JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_question TEXT,
  model_version     TEXT,
  prompt_version    TEXT,
  completed_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_run_status_valid CHECK (status IN ('processing', 'completed', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_card ON public.ai_screening_runs (card_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_screening_checks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     UUID NOT NULL REFERENCES public.ai_screening_runs(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  title      TEXT NOT NULL,
  status     TEXT,
  summary    TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_checks_run ON public.ai_screening_checks (run_id, sort_order);

CREATE TABLE IF NOT EXISTS public.ai_screening_evidence (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             UUID NOT NULL REFERENCES public.ai_screening_runs(id) ON DELETE CASCADE,
  check_id           UUID REFERENCES public.ai_screening_checks(id) ON DELETE SET NULL,
  source             TEXT,
  evidence           TEXT,
  source_url         TEXT,
  verification_label TEXT,
  confidence         TEXT,
  verified_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_evidence_run ON public.ai_screening_evidence (run_id);

CREATE TABLE IF NOT EXISTS public.referrer_drop_preferences (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  companies  TEXT[],
  roles      TEXT[],
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_drop_prefs_touch ON public.referrer_drop_preferences;
CREATE TRIGGER trg_drop_prefs_touch BEFORE UPDATE ON public.referrer_drop_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ConnectX backend — career-trust / passport extension
-- =============================================================================
-- Consent-gated career claims, evidence, professional verification, and shareable
-- referral passports. Ports the shapes behind careerProofService / passportService.
-- Authorization + consent are enforced in the service layer. Cryptographic audit
-- guarantees are simplified vs. the original RPCs (documented in the README).
-- Idempotent. Applied after the earlier extensions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.consent_grants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purpose        TEXT NOT NULL,
  scope          JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_version TEXT NOT NULL DEFAULT 'v1.0',
  status         TEXT NOT NULL DEFAULT 'active',
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  withdrawn_at   TIMESTAMPTZ,
  CONSTRAINT consent_purpose_valid CHECK (purpose IN (
    'ai_processing', 'reusable_proof', 'professional_verification',
    'passport_share', 'recruiter_discovery', 'outcome_training', 'aggregate_benchmarking'
  )),
  CONSTRAINT consent_status_valid CHECK (status IN ('active', 'withdrawn', 'expired'))
);
CREATE INDEX IF NOT EXISTS idx_consent_user ON public.consent_grants (user_id, purpose, status);

CREATE TABLE IF NOT EXISTS public.competencies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  version     INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'active',
  prohibited  BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO public.competencies (slug, name, category) VALUES
  ('backend-engineering', 'Backend Engineering', 'engineering'),
  ('frontend-engineering', 'Frontend Engineering', 'engineering'),
  ('system-design', 'System Design', 'engineering'),
  ('data-engineering', 'Data Engineering', 'data'),
  ('product-management', 'Product Management', 'product'),
  ('project-leadership', 'Project Leadership', 'leadership'),
  ('communication', 'Communication', 'general')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.career_projects (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  contribution_scope TEXT,
  started_on         DATE,
  ended_on           DATE,
  status             TEXT NOT NULL DEFAULT 'draft',
  visibility         TEXT NOT NULL DEFAULT 'private',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_projects_candidate ON public.career_projects (candidate_id, updated_at DESC);
DROP TRIGGER IF EXISTS trg_career_projects_touch ON public.career_projects;
CREATE TRIGGER trg_career_projects_touch BEFORE UPDATE ON public.career_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.career_claims (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id             UUID REFERENCES public.career_projects(id) ON DELETE SET NULL,
  parent_claim_id        UUID REFERENCES public.career_claims(id) ON DELETE SET NULL,
  title                  TEXT NOT NULL,
  action_text            TEXT NOT NULL,
  object_text            TEXT NOT NULL,
  context_text           TEXT NOT NULL DEFAULT '',
  result_text            TEXT,
  contribution_scope     TEXT NOT NULL DEFAULT 'individual',
  period_start           DATE,
  period_end             DATE,
  status                 TEXT NOT NULL DEFAULT 'draft',
  visibility             TEXT NOT NULL DEFAULT 'private',
  consent_grant_id       UUID REFERENCES public.consent_grants(id) ON DELETE SET NULL,
  candidate_confirmed_at TIMESTAMPTZ,
  superseded_by          UUID REFERENCES public.career_claims(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT claim_status_valid CHECK (status IN ('draft', 'active', 'superseded', 'archived', 'disputed', 'expired')),
  CONSTRAINT claim_visibility_valid CHECK (visibility IN ('private', 'passport_eligible', 'discovery_eligible'))
);
CREATE INDEX IF NOT EXISTS idx_career_claims_candidate ON public.career_claims (candidate_id, updated_at DESC);
DROP TRIGGER IF EXISTS trg_career_claims_touch ON public.career_claims;
CREATE TRIGGER trg_career_claims_touch BEFORE UPDATE ON public.career_claims
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.claim_competencies (
  claim_id               UUID NOT NULL REFERENCES public.career_claims(id) ON DELETE CASCADE,
  competency_id          UUID NOT NULL REFERENCES public.competencies(id) ON DELETE CASCADE,
  mapping_source         TEXT NOT NULL DEFAULT 'candidate',
  candidate_confirmed_at TIMESTAMPTZ,
  confidence             TEXT NOT NULL DEFAULT 'low',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (claim_id, competency_id)
);

CREATE TABLE IF NOT EXISTS public.evidence_artifacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  artifact_type    TEXT NOT NULL,
  storage_bucket   TEXT,
  storage_path     TEXT,
  canonical_url    TEXT,
  independence_key TEXT,
  status           TEXT NOT NULL DEFAULT 'available',
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_updated_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_artifacts_candidate ON public.evidence_artifacts (candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.claim_evidence (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id               UUID NOT NULL REFERENCES public.career_claims(id) ON DELETE CASCADE,
  artifact_id            UUID NOT NULL REFERENCES public.evidence_artifacts(id) ON DELETE CASCADE,
  evidence_text          TEXT NOT NULL DEFAULT '',
  source_locator         JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance             TEXT NOT NULL DEFAULT 'candidate_declared',
  verification_state     TEXT NOT NULL DEFAULT 'unreviewed',
  confidence             TEXT NOT NULL DEFAULT 'low',
  consent_grant_id       UUID REFERENCES public.consent_grants(id) ON DELETE SET NULL,
  candidate_confirmed_at TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ,
  verified_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON public.claim_evidence (claim_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.trust_disputes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject_type          TEXT NOT NULL,
  subject_id            UUID NOT NULL,
  reason_code           TEXT NOT NULL,
  description           TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open',
  resolution            TEXT,
  resulting_subject_type TEXT,
  resulting_subject_id  UUID,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dispute_status_valid CHECK (status IN ('open', 'awaiting_response', 'resolved_upheld', 'resolved_changed'))
);
CREATE INDEX IF NOT EXISTS idx_disputes_candidate ON public.trust_disputes (candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.verification_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  verifier_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_interaction_id TEXT,
  consent_grant_id      UUID REFERENCES public.consent_grants(id) ON DELETE SET NULL,
  purpose               TEXT NOT NULL DEFAULT 'professional_verification',
  status                TEXT NOT NULL DEFAULT 'pending',
  candidate_message     TEXT,
  decline_reason        TEXT,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verif_status_valid CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'completed', 'expired'))
);
CREATE INDEX IF NOT EXISTS idx_verif_candidate ON public.verification_requests (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verif_verifier ON public.verification_requests (verifier_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_verif_touch ON public.verification_requests;
CREATE TRIGGER trg_verif_touch BEFORE UPDATE ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.verification_request_claims (
  request_id UUID NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  claim_id   UUID NOT NULL REFERENCES public.career_claims(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, claim_id)
);
CREATE TABLE IF NOT EXISTS public.verification_request_evidence (
  request_id  UUID NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES public.claim_evidence(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS public.attestations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  verifier_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  verification_request_id UUID REFERENCES public.verification_requests(id) ON DELETE SET NULL,
  replaces_attestation_id UUID REFERENCES public.attestations(id) ON DELETE SET NULL,
  claim_id                UUID REFERENCES public.career_claims(id) ON DELETE SET NULL,
  competency_id           UUID REFERENCES public.competencies(id) ON DELETE SET NULL,
  observation_basis       TEXT,
  observed_behavior       TEXT,
  scope_limitation        TEXT,
  confidence              TEXT NOT NULL DEFAULT 'medium',
  relationship            TEXT,
  conflict_disclosure     TEXT,
  status                  TEXT NOT NULL DEFAULT 'issued',
  issued_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at             TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
  revoked_at              TIMESTAMPTZ,
  revocation_reason       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attestation_status_valid CHECK (status IN ('issued', 'accepted', 'private', 'disputed', 'revoked'))
);
CREATE INDEX IF NOT EXISTS idx_attest_candidate ON public.attestations (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attest_verifier ON public.attestations (verifier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.referral_passports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  purpose        TEXT NOT NULL DEFAULT 'referral',
  target_role    TEXT,
  target_level   TEXT,
  target_company TEXT,
  target_job_id  TEXT,
  rubric_id      UUID,
  status         TEXT NOT NULL DEFAULT 'draft',
  snapshot       JSONB,
  version        INTEGER NOT NULL DEFAULT 1,
  superseded_by  UUID REFERENCES public.referral_passports(id) ON DELETE SET NULL,
  issued_at      TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT passport_status_valid CHECK (status IN ('draft', 'ready', 'revoked', 'superseded'))
);
CREATE INDEX IF NOT EXISTS idx_passports_candidate ON public.referral_passports (candidate_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_passports_touch ON public.referral_passports;
CREATE TRIGGER trg_passports_touch BEFORE UPDATE ON public.referral_passports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.passport_items (
  passport_id      UUID NOT NULL REFERENCES public.referral_passports(id) ON DELETE CASCADE,
  item_type        TEXT NOT NULL,
  item_id          UUID NOT NULL,
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (passport_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS public.passport_share_grants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id      UUID NOT NULL REFERENCES public.referral_passports(id) ON DELETE CASCADE,
  recipient_type   TEXT NOT NULL DEFAULT 'link',
  recipient_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  purpose          TEXT NOT NULL DEFAULT 'referral_review',
  max_views        INTEGER NOT NULL DEFAULT 10,
  views_used       INTEGER NOT NULL DEFAULT 0,
  token_hash       TEXT NOT NULL,
  allow_download   BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at       TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_share_grants_passport ON public.passport_share_grants (passport_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_share_grant_token ON public.passport_share_grants (token_hash);

CREATE TABLE IF NOT EXISTS public.passport_access_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id   UUID NOT NULL REFERENCES public.referral_passports(id) ON DELETE CASCADE,
  grant_id      UUID REFERENCES public.passport_share_grants(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_events_passport ON public.passport_access_events (passport_id, occurred_at DESC);

-- Simple idempotency ledger for trust mutations that accept an idempotency key.
CREATE TABLE IF NOT EXISTS public.trust_idempotency (
  actor_id   UUID NOT NULL,
  operation  TEXT NOT NULL,
  idem_key   TEXT NOT NULL,
  response   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_id, operation, idem_key)
);

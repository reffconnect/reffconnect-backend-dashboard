-- ConnectX backend — integrations extension (work-email OTP + email outbox)
-- =============================================================================
-- Supports the work-email OTP flow (employment proof) and a durable email
-- outbox used as a fallback / audit when Resend is unavailable.
-- Idempotent. Applied after the earlier extensions.
-- =============================================================================

-- One live challenge per (user, email) at a time; superseded rows are consumed.
CREATE TABLE IF NOT EXISTS public.work_email_verifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  email_domain TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_email_verif_user ON public.work_email_verifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_email_verif_live
  ON public.work_email_verifications (user_id, lower(email)) WHERE consumed_at IS NULL;

-- Durable email log. When Resend is configured, rows are marked sent; otherwise
-- they stay 'queued' so nothing is silently lost in local/dev.
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body_html   TEXT NOT NULL,
  template    TEXT,
  status      TEXT NOT NULL DEFAULT 'queued',
  provider_id TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ,
  CONSTRAINT email_outbox_status_valid CHECK (status IN ('queued', 'sent', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON public.email_outbox (status, created_at DESC);

-- ConnectX backend — payments extension (Razorpay)
-- =============================================================================
-- Order lifecycle + idempotent settlement + webhook dedupe. Prices are ALWAYS
-- resolved server-side (never trusted from the client). Mirrors migration 055.
-- Idempotent. Applied after schema.sql + extend_10_bookings.sql.
-- =============================================================================

-- Singleton settings row (id is always TRUE).
CREATE TABLE IF NOT EXISTS public.payment_settings (
  id                   BOOLEAN PRIMARY KEY DEFAULT TRUE,
  default_price_inr    JSONB NOT NULL DEFAULT '{"resume-review":299}'::jsonb,
  platform_fee_bps     INTEGER NOT NULL DEFAULT 1500,
  order_ttl_minutes    INTEGER NOT NULL DEFAULT 30,
  enforce_payment_gate BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_settings_singleton CHECK (id = TRUE)
);
INSERT INTO public.payment_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
DROP TRIGGER IF EXISTS trg_payment_settings_touch ON public.payment_settings;
CREATE TRIGGER trg_payment_settings_touch BEFORE UPDATE ON public.payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- One order per checkout attempt.
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  service_id         TEXT NOT NULL,
  amount_paise       BIGINT NOT NULL,
  platform_fee_paise BIGINT NOT NULL DEFAULT 0,
  seller_net_paise   BIGINT NOT NULL DEFAULT 0,
  fee_rate_bps       INTEGER NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'INR',
  status             TEXT NOT NULL DEFAULT 'created',
  razorpay_order_id  TEXT UNIQUE,
  razorpay_payment_id TEXT,
  slot_label         TEXT,
  notes              JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at            TIMESTAMPTZ,
  failure_reason     TEXT,
  consumed_at        TIMESTAMPTZ,
  consumed_ref_type  TEXT,
  consumed_ref_id    TEXT,
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_orders_status_valid CHECK (status IN ('created', 'paid', 'failed', 'expired')),
  CONSTRAINT payment_orders_distinct_parties CHECK (buyer_id <> seller_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_buyer  ON public.payment_orders (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_seller ON public.payment_orders (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON public.payment_orders (status);
DROP TRIGGER IF EXISTS trg_payment_orders_touch ON public.payment_orders;
CREATE TRIGGER trg_payment_orders_touch BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Webhook idempotency ledger (UNIQUE event id).
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_event_id   TEXT NOT NULL UNIQUE,
  event_type          TEXT NOT NULL,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at        TIMESTAMPTZ,
  process_error       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

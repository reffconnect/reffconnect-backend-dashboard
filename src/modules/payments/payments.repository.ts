import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../utils/AppError';

export interface PaymentOrderRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  service_id: string;
  amount_paise: number;
  platform_fee_paise: number;
  seller_net_paise: number;
  fee_rate_bps: number;
  currency: string;
  status: 'created' | 'paid' | 'failed' | 'expired';
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  slot_label: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The ONLY place a chargeable amount is decided. Returns paise. */
export async function resolveServicePricePaise(sellerId: string, serviceId: string): Promise<number> {
  const configured = await query<{ price: number | null }>(
    `SELECT price FROM public.service_configurations
      WHERE user_id = $1 AND service_id = $2 AND is_active = TRUE AND price IS NOT NULL
      LIMIT 1`,
    [sellerId, serviceId],
  );
  let priceInr = configured.rows[0]?.price ?? null;
  if (priceInr === null) {
    const fallback = await query<{ price: number | null }>(
      `SELECT (default_price_inr ->> $1)::int AS price FROM public.payment_settings WHERE id = TRUE`,
      [serviceId],
    );
    priceInr = fallback.rows[0]?.price ?? null;
  }
  if (priceInr === null || priceInr <= 0) {
    throw AppError.badRequest(`No active price is configured for ${serviceId} by this professional`);
  }
  return priceInr * 100;
}

export async function getFeeBps(): Promise<number> {
  const { rows } = await query<{ platform_fee_bps: number }>(
    `SELECT platform_fee_bps FROM public.payment_settings WHERE id = TRUE`,
  );
  return rows[0]?.platform_fee_bps ?? 1500;
}

export async function createOrder(params: {
  buyerId: string;
  sellerId: string;
  serviceId: string;
  amountPaise: number;
  feeBps: number;
  slotLabel: string | null;
}): Promise<PaymentOrderRow> {
  const feePaise = Math.round((params.amountPaise * params.feeBps) / 10_000);
  const { rows } = await query<PaymentOrderRow>(
    `INSERT INTO public.payment_orders
       (buyer_id, seller_id, service_id, amount_paise, platform_fee_paise, seller_net_paise, fee_rate_bps, slot_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      params.buyerId,
      params.sellerId,
      params.serviceId,
      params.amountPaise,
      feePaise,
      params.amountPaise - feePaise,
      params.feeBps,
      params.slotLabel,
    ],
  );
  if (!rows[0]) throw AppError.internal('Failed to create payment order');
  return rows[0];
}

export async function attachRazorpayOrder(id: string, razorpayOrderId: string): Promise<void> {
  await query(
    `UPDATE public.payment_orders SET razorpay_order_id = $2
      WHERE id = $1 AND status = 'created' AND razorpay_order_id IS NULL`,
    [id, razorpayOrderId],
  );
}

export async function getById(id: string): Promise<PaymentOrderRow | null> {
  const { rows } = await query<PaymentOrderRow>(`SELECT * FROM public.payment_orders WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function getByRazorpayOrderId(orderId: string): Promise<PaymentOrderRow | null> {
  const { rows } = await query<PaymentOrderRow>(
    `SELECT * FROM public.payment_orders WHERE razorpay_order_id = $1 LIMIT 1`,
    [orderId],
  );
  return rows[0] ?? null;
}

/** Idempotent settlement. Safe for webhook + client-verify in either order/twice. */
export async function markPaid(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  source: string,
): Promise<PaymentOrderRow> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<PaymentOrderRow>(
      `SELECT * FROM public.payment_orders WHERE razorpay_order_id = $1 FOR UPDATE`,
      [razorpayOrderId],
    );
    const order = rows[0];
    if (!order) throw AppError.notFound('No payment order for that Razorpay order');
    if (order.status === 'paid') {
      if (order.razorpay_payment_id === razorpayPaymentId) return order; // genuine redelivery
      throw AppError.conflict('Order already paid by a different payment');
    }
    const updated = await client.query<PaymentOrderRow>(
      `UPDATE public.payment_orders
          SET status = 'paid', razorpay_payment_id = $2, paid_at = NOW(), failure_reason = NULL,
              notes = notes || jsonb_build_object('paid_via', $3::text)
        WHERE id = $1
        RETURNING *`,
      [order.id, razorpayPaymentId, source],
    );
    const row = updated.rows[0];
    if (!row) throw AppError.internal('Failed to settle payment order');
    return row;
  });
}

export async function markFailed(razorpayOrderId: string, reason: string): Promise<void> {
  await query(
    `UPDATE public.payment_orders SET status = 'failed', failure_reason = $2
      WHERE razorpay_order_id = $1 AND status = 'created'`,
    [razorpayOrderId, reason],
  );
}

/** Claim a webhook event id. Returns false if it was already recorded (dedupe). */
export async function recordWebhookEvent(params: {
  eventId: string;
  eventType: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  payload: unknown;
}): Promise<{ inserted: boolean; rowId: string | null }> {
  const { rows, rowCount } = await query<{ id: string }>(
    `INSERT INTO public.payment_webhook_events
       (razorpay_event_id, event_type, razorpay_order_id, razorpay_payment_id, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (razorpay_event_id) DO NOTHING
     RETURNING id`,
    [
      params.eventId,
      params.eventType,
      params.razorpayOrderId,
      params.razorpayPaymentId,
      JSON.stringify(params.payload ?? {}),
    ],
  );
  return { inserted: (rowCount ?? 0) > 0, rowId: rows[0]?.id ?? null };
}

export async function finishWebhookEvent(rowId: string, error: string | null): Promise<void> {
  await query(
    `UPDATE public.payment_webhook_events SET processed_at = NOW(), process_error = $2 WHERE id = $1`,
    [rowId, error],
  );
}

export async function getEnforceGate(): Promise<boolean> {
  const { rows } = await query<{ enforce_payment_gate: boolean }>(
    `SELECT enforce_payment_gate FROM public.payment_settings WHERE id = TRUE`,
  );
  return rows[0]?.enforce_payment_gate ?? false;
}

/**
 * Atomically claim a paid, unconsumed order matching buyer/seller/service, on the
 * GIVEN transaction client (so the claim and the booking insert commit together).
 * The WHERE clause is the double-spend guard. Returns a reason on failure.
 */
export async function consumePaidOrderWith(
  client: PoolClient,
  params: { orderId: string; buyerId: string; sellerId: string; serviceId: string; refType: string },
): Promise<{ ok: boolean; reason?: string }> {
  const claim = await client.query<{ id: string }>(
    `UPDATE public.payment_orders
        SET consumed_at = NOW(), consumed_ref_type = $5
      WHERE id = $1 AND buyer_id = $2 AND seller_id = $3 AND service_id = $4
        AND status = 'paid' AND consumed_at IS NULL
      RETURNING id`,
    [params.orderId, params.buyerId, params.sellerId, params.serviceId, params.refType],
  );
  if (claim.rows[0]) return { ok: true };

  const diag = await client.query<{
    buyer_id: string;
    seller_id: string;
    service_id: string;
    status: string;
    consumed_at: string | null;
  }>(
    `SELECT buyer_id, seller_id, service_id, status, consumed_at FROM public.payment_orders WHERE id = $1 LIMIT 1`,
    [params.orderId],
  );
  const row = diag.rows[0];
  if (!row) return { ok: false, reason: 'Payment order not found' };
  if (row.buyer_id !== params.buyerId) return { ok: false, reason: 'Payment order belongs to a different user' };
  if (row.consumed_at) return { ok: false, reason: 'Payment order has already been used for another booking' };
  if (row.status !== 'paid') return { ok: false, reason: `Payment order is not paid (status: ${row.status})` };
  if (row.seller_id !== params.sellerId) return { ok: false, reason: 'Payment order was raised for a different professional' };
  return { ok: false, reason: `Payment order is not valid for ${params.serviceId}` };
}

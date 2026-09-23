import type { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import * as razorpay from '../../integrations/razorpay';
import * as repo from './payments.repository';
import type { CreateOrderInput, VerifyPaymentInput } from './payments.schema';

export interface CreateOrderResult {
  paymentOrderId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}

export async function createOrder(buyerId: string, input: CreateOrderInput): Promise<CreateOrderResult> {
  if (!razorpay.isEnabled()) {
    throw new AppError(503, 'Payments are not configured on this server', { code: 'payments_unconfigured' });
  }
  if (buyerId === input.referrerId) {
    throw AppError.badRequest('You cannot book a service with yourself');
  }

  const amountPaise = await repo.resolveServicePricePaise(input.referrerId, input.serviceId);
  const feeBps = await repo.getFeeBps();
  const order = await repo.createOrder({
    buyerId,
    sellerId: input.referrerId,
    serviceId: input.serviceId,
    amountPaise,
    feeBps,
    slotLabel: input.slotLabel ?? null,
  });

  try {
    const rzp = await razorpay.createOrder(amountPaise, order.currency, order.id);
    await repo.attachRazorpayOrder(order.id, rzp.id);
    return {
      paymentOrderId: order.id,
      razorpayOrderId: rzp.id,
      amountPaise,
      currency: order.currency,
      keyId: razorpay.publicKeyId(),
    };
  } catch (err) {
    await repo.markFailed(order.razorpay_order_id ?? '', 'gateway order creation failed').catch(() => undefined);
    throw err;
  }
}

export async function verifyPayment(
  buyerId: string,
  input: VerifyPaymentInput,
): Promise<{ paymentOrderId: string; status: string; amountPaise: number }> {
  if (!razorpay.verifyPaymentSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
    throw AppError.badRequest('Payment signature verification failed');
  }
  const existing = await repo.getByRazorpayOrderId(input.razorpayOrderId);
  if (!existing) throw AppError.notFound('Payment order not found');
  if (existing.buyer_id !== buyerId) throw AppError.forbidden('This order belongs to a different user');

  const paid = await repo.markPaid(input.razorpayOrderId, input.razorpayPaymentId, 'client-verify');
  return { paymentOrderId: paid.id, status: paid.status, amountPaise: paid.amount_paise };
}

/**
 * Authoritative settlement path. Verifies the signature over the raw body,
 * dedupes by event id, and applies paid/failed. Always resolves (never throws)
 * so the caller can return the right status code to the gateway.
 */
export async function handleWebhook(
  rawBody: Buffer,
  signature: string,
  eventIdHeader: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!signature || !razorpay.verifyWebhookSignature(rawBody, signature)) {
    return { status: 401, body: { error: 'Invalid signature' } };
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; error_description?: string } }; order?: { entity?: { id?: string } } };
  };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } };
  }

  const eventType = event.event ?? 'unknown';
  const paymentEntity = event.payload?.payment?.entity ?? null;
  const orderEntity = event.payload?.order?.entity ?? null;
  const razorpayPaymentId = paymentEntity?.id ?? null;
  const razorpayOrderId = paymentEntity?.order_id ?? orderEntity?.id ?? null;
  const eventId = eventIdHeader || `${eventType}:${razorpayPaymentId ?? razorpayOrderId ?? Date.now()}`;

  const claim = await repo.recordWebhookEvent({
    eventId,
    eventType,
    razorpayOrderId,
    razorpayPaymentId,
    payload: event,
  });
  if (!claim.inserted) return { status: 200, body: { received: true, deduplicated: true } };

  let processError: string | null = null;
  try {
    if ((eventType === 'payment.captured' || eventType === 'order.paid') && razorpayOrderId && razorpayPaymentId) {
      await repo.markPaid(razorpayOrderId, razorpayPaymentId, `webhook:${eventType}`);
    } else if (eventType === 'payment.failed' && razorpayOrderId) {
      await repo.markFailed(razorpayOrderId, paymentEntity?.error_description ?? 'Payment failed at gateway');
    }
  } catch (err) {
    processError = err instanceof Error ? err.message : String(err);
    logger.error('payments webhook processing error', processError);
  } finally {
    if (claim.rowId) await repo.finishWebhookEvent(claim.rowId, processError).catch(() => undefined);
  }

  return { status: 200, body: { received: true } };
}

export async function getOrder(buyerId: string, id: string): Promise<repo.PaymentOrderRow> {
  const order = await repo.getById(id);
  if (!order) throw AppError.notFound('Payment order not found');
  if (order.buyer_id !== buyerId && order.seller_id !== buyerId) {
    throw AppError.forbidden('You do not have access to this order');
  }
  return order;
}

/**
 * Booking payment gate — split so the order is consumed in the SAME transaction
 * as the booking insert (atomic: a failed insert rolls back the consume).
 *
 * `precheckBookingPayment` decides (outside the tx) whether an order must be
 * consumed: it reads the enforce flag and validates the order's presence.
 * `consumeOrderWith` then claims the order on the transaction client.
 */
export async function precheckBookingPayment(params: {
  orderId?: string | null;
  sellerId: string | null;
}): Promise<'consume' | 'skip'> {
  const enforce = await repo.getEnforceGate();
  if (!params.orderId) {
    if (enforce) throw AppError.badRequest('Payment required: this booking has no associated payment order');
    return 'skip';
  }
  if (!params.sellerId) {
    throw AppError.badRequest('Cannot validate payment: the professional could not be resolved');
  }
  return 'consume';
}

export async function consumeOrderWith(
  client: PoolClient,
  params: {
    orderId: string;
    buyerId: string;
    sellerId: string;
    serviceId: 'referral-session' | 'resume-review' | 'interview-mock';
    refType: string;
  },
): Promise<void> {
  const result = await repo.consumePaidOrderWith(client, params);
  if (!result.ok) throw AppError.badRequest(result.reason ?? 'Payment order is not valid for this booking');
}

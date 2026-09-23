/**
 * Razorpay adapter. Fails closed: if keys are absent, checkout returns 503 and
 * no order is created — payment is never skipped. Uses the REST API directly
 * (no SDK) via global fetch (Node >= 18).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config/env';
import { AppError } from '../utils/AppError';

const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

function requireKeys(): { keyId: string; keySecret: string } {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    throw new AppError(503, 'Payments are not configured on this server', { code: 'payments_unconfigured' });
  }
  return { keyId: config.RAZORPAY_KEY_ID, keySecret: config.RAZORPAY_KEY_SECRET };
}

export function isEnabled(): boolean {
  return config.paymentsEnabled;
}

export function publicKeyId(): string {
  return requireKeys().keyId;
}

export async function createOrder(
  amountPaise: number,
  currency: string,
  receipt: string,
): Promise<RazorpayOrder> {
  const { keyId, keySecret } = requireKeys();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const res = await fetch(RAZORPAY_ORDERS_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency, receipt, payment_capture: 1 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, `Razorpay order creation failed (${res.status})`, {
      code: 'gateway_error',
      details: text.slice(0, 500),
    });
  }
  return (await res.json()) as RazorpayOrder;
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Verifies the checkout signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const { keySecret } = requireKeys();
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Verifies a webhook signature over the RAW request body. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!config.RAZORPAY_WEBHOOK_SECRET) {
    throw new AppError(503, 'Payment webhook secret is not configured', { code: 'payments_unconfigured' });
  }
  const expected = createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature.toLowerCase());
}

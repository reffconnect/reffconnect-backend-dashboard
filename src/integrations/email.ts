/**
 * Email adapter. Sends via Resend when configured; always records the message in
 * the email_outbox for durability/audit. When Resend is unavailable the row
 * stays 'queued' so nothing is silently dropped — email never blocks a flow.
 */
import { config } from '../config/env';
import { query } from '../db/pool';
import { logger } from '../utils/logger';

const RESEND_API = 'https://api.resend.com/emails';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  template?: string;
}

export function isEnabled(): boolean {
  return config.emailEnabled;
}

export async function sendEmail(input: SendEmailInput): Promise<{ queuedId: string; sent: boolean }> {
  const insert = await query<{ id: string }>(
    `INSERT INTO public.email_outbox (to_email, subject, body_html, template, status)
     VALUES ($1, $2, $3, $4, 'queued') RETURNING id`,
    [input.to, input.subject, input.html, input.template ?? null],
  );
  const rowId = insert.rows[0]?.id ?? '';

  if (!config.emailEnabled) {
    logger.warn(`Email not sent (Resend unconfigured); queued in outbox: ${input.subject} -> ${input.to}`);
    return { queuedId: rowId, sent: false };
  }

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.SENDER_EMAIL, to: input.to, subject: input.subject, html: input.html }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      await query(`UPDATE public.email_outbox SET status = 'failed', error = $2 WHERE id = $1`, [
        rowId,
        text.slice(0, 500),
      ]);
      logger.error(`Resend send failed (${res.status})`, text.slice(0, 200));
      return { queuedId: rowId, sent: false };
    }
    const body = (await res.json()) as { id?: string };
    await query(`UPDATE public.email_outbox SET status = 'sent', provider_id = $2, sent_at = NOW() WHERE id = $1`, [
      rowId,
      body.id ?? null,
    ]);
    return { queuedId: rowId, sent: true };
  } catch (err) {
    await query(`UPDATE public.email_outbox SET status = 'failed', error = $2 WHERE id = $1`, [
      rowId,
      err instanceof Error ? err.message : String(err),
    ]);
    return { queuedId: rowId, sent: false };
  }
}

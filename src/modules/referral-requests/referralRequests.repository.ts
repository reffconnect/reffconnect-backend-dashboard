import type { PoolClient } from 'pg';
import { pool, query } from '../../db/pool';
import type { CreateReferralRequestInput } from './referralRequests.schema';

export interface ReferralRequestRow {
  id: number;
  requester_id: string;
  requester_name: string;
  referrer_id: string | null;
  referrer_name: string;
  referrer_company: string;
  referrer_title: string | null;
  status: string;
  personal_message: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export async function insert(
  requesterId: string,
  requesterName: string,
  referrerId: string | null,
  grossAmount: number | null,
  input: CreateReferralRequestInput,
  client?: PoolClient,
): Promise<ReferralRequestRow> {
  const runner = client ?? pool;
  const { rows } = await runner.query<ReferralRequestRow>(
    `INSERT INTO public.referral_requests
       (requester_id, requester_name, referrer_id, referrer_name, referrer_company, referrer_title,
        job_url, job_title, role_type, message_template, personal_message, technical_skills,
        experience_level, priority, resume_file_name, resume_file_path, preferred_day, preferred_time,
        preferred_timezone, requested_duration_minutes, status, gross_amount, payment_order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'pending',$21,$22)
     RETURNING *`,
    [
      requesterId,
      requesterName,
      referrerId,
      input.referrer_name,
      input.referrer_company,
      input.referrer_title ?? null,
      input.job_url ?? null,
      input.job_title ?? null,
      input.role_type ?? null,
      input.message_template ?? null,
      input.personal_message,
      input.technical_skills ?? null,
      input.experience_level ?? null,
      input.priority,
      input.resume_file_name ?? null,
      input.resume_file_path ?? null,
      input.preferred_day ?? null,
      input.preferred_time ?? null,
      input.preferred_timezone ?? null,
      input.requested_duration_minutes ?? null,
      grossAmount,
      input.payment_order_id ?? null,
    ],
  );
  if (!rows[0]) throw new Error('Failed to create referral request');
  return rows[0];
}

export async function listForRequester(requesterId: string): Promise<ReferralRequestRow[]> {
  const { rows } = await query<ReferralRequestRow>(
    `SELECT * FROM public.referral_requests WHERE requester_id = $1 ORDER BY created_at DESC`,
    [requesterId],
  );
  return rows;
}

export async function listForReferrer(referrerId: string): Promise<ReferralRequestRow[]> {
  const { rows } = await query<ReferralRequestRow>(
    `SELECT * FROM public.referral_requests WHERE referrer_id = $1 ORDER BY created_at DESC`,
    [referrerId],
  );
  return rows;
}

export async function getById(id: number): Promise<ReferralRequestRow | null> {
  const { rows } = await query<ReferralRequestRow>(
    `SELECT * FROM public.referral_requests WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function setStatus(id: number, status: string): Promise<ReferralRequestRow | null> {
  const { rows } = await query<ReferralRequestRow>(
    `UPDATE public.referral_requests SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
}

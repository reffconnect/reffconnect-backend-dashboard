import type { PoolClient } from 'pg';
import { pool, query } from '../../db/pool';
import type { CreateMockInterviewInput } from './mockInterviews.schema';

export interface MockInterviewRequestRow {
  id: number;
  requester_id: string;
  requester_name: string;
  referrer_id: string | null;
  referrer_name: string;
  referrer_company: string;
  referrer_title: string | null;
  company_question: string | null;
  focus_note: string | null;
  status: string;
  price: number | null;
  gross_amount: number | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export async function insert(
  requesterId: string,
  requesterName: string,
  referrerId: string | null,
  grossAmount: number | null,
  input: CreateMockInterviewInput,
  client?: PoolClient,
): Promise<MockInterviewRequestRow> {
  const runner = client ?? pool;
  const { rows } = await runner.query<MockInterviewRequestRow>(
    `INSERT INTO public.mock_interview_requests
       (requester_id, requester_name, referrer_id, referrer_name, referrer_company, referrer_title,
        company_question, focus_note, preferred_day, preferred_time, preferred_timezone,
        requested_duration_minutes, price, status, gross_amount, payment_order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,$15)
     RETURNING *`,
    [
      requesterId,
      requesterName,
      referrerId,
      input.referrer_name,
      input.referrer_company,
      input.referrer_title ?? null,
      input.company_question ?? null,
      input.focus_note ?? null,
      input.preferred_day ?? null,
      input.preferred_time ?? null,
      input.preferred_timezone ?? null,
      input.requested_duration_minutes ?? null,
      grossAmount,
      grossAmount,
      input.payment_order_id ?? null,
    ],
  );
  if (!rows[0]) throw new Error('Failed to create mock interview request');
  return rows[0];
}

export async function listForRequester(requesterId: string): Promise<MockInterviewRequestRow[]> {
  const { rows } = await query<MockInterviewRequestRow>(
    `SELECT * FROM public.mock_interview_requests WHERE requester_id = $1 ORDER BY created_at DESC`,
    [requesterId],
  );
  return rows;
}

export async function listForReferrer(referrerId: string): Promise<MockInterviewRequestRow[]> {
  const { rows } = await query<MockInterviewRequestRow>(
    `SELECT * FROM public.mock_interview_requests WHERE referrer_id = $1 ORDER BY created_at DESC`,
    [referrerId],
  );
  return rows;
}

export async function getById(id: number): Promise<MockInterviewRequestRow | null> {
  const { rows } = await query<MockInterviewRequestRow>(
    `SELECT * FROM public.mock_interview_requests WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function setStatus(id: number, status: string): Promise<MockInterviewRequestRow | null> {
  const { rows } = await query<MockInterviewRequestRow>(
    `UPDATE public.mock_interview_requests SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
}

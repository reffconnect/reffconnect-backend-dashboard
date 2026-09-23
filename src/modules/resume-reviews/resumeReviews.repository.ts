import type { PoolClient } from 'pg';
import { pool, query } from '../../db/pool';
import type { CreateResumeReviewInput } from './resumeReviews.schema';

export interface ResumeReviewRow {
  id: number;
  requester_id: string;
  requester_name: string;
  referrer_id: string | null;
  referrer_name: string;
  referrer_company: string;
  referrer_title: string | null;
  target_role: string | null;
  focus_note: string | null;
  jd_url: string | null;
  resume_file_path: string;
  status: string;
  feedback_text: string | null;
  feedback_submitted_at: string | null;
  is_rated: boolean;
  gross_amount: number | null;
  created_at: string;
  updated_at: string;
}

export async function insert(
  requesterId: string,
  requesterName: string,
  referrerId: string | null,
  grossAmount: number | null,
  input: CreateResumeReviewInput,
  client?: PoolClient,
): Promise<ResumeReviewRow> {
  const runner = client ?? pool;
  const { rows } = await runner.query<ResumeReviewRow>(
    `INSERT INTO public.resume_review_requests
       (requester_id, requester_name, referrer_id, referrer_name, referrer_company, referrer_title,
        target_role, focus_note, jd_url, resume_file_path, status, gross_amount, payment_order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12)
     RETURNING *`,
    [
      requesterId,
      requesterName,
      referrerId,
      input.referrer_name,
      input.referrer_company,
      input.referrer_title ?? null,
      input.target_role ?? null,
      input.focus_note ?? null,
      input.jd_url ?? null,
      input.resume_file_path,
      grossAmount,
      input.payment_order_id ?? null,
    ],
  );
  if (!rows[0]) throw new Error('Failed to create resume review request');
  return rows[0];
}

export async function listForRequester(requesterId: string): Promise<ResumeReviewRow[]> {
  const { rows } = await query<ResumeReviewRow>(
    `SELECT * FROM public.resume_review_requests WHERE requester_id = $1 ORDER BY created_at DESC`,
    [requesterId],
  );
  return rows;
}

export async function listForReferrer(referrerId: string): Promise<ResumeReviewRow[]> {
  const { rows } = await query<ResumeReviewRow>(
    `SELECT * FROM public.resume_review_requests WHERE referrer_id = $1 ORDER BY created_at DESC`,
    [referrerId],
  );
  return rows;
}

export async function getById(id: number): Promise<ResumeReviewRow | null> {
  const { rows } = await query<ResumeReviewRow>(
    `SELECT * FROM public.resume_review_requests WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function setStatus(id: number, status: string): Promise<ResumeReviewRow | null> {
  const { rows } = await query<ResumeReviewRow>(
    `UPDATE public.resume_review_requests SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
}

export async function submitFeedback(id: number, feedbackText: string): Promise<ResumeReviewRow | null> {
  const { rows } = await query<ResumeReviewRow>(
    `UPDATE public.resume_review_requests
        SET feedback_text = $2, feedback_submitted_at = NOW(), status = 'feedback_delivered'
      WHERE id = $1
      RETURNING *`,
    [id, feedbackText],
  );
  return rows[0] ?? null;
}

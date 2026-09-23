import { query, withTransaction } from '../../db/pool';

export type SessionKind = 'referral' | 'mock';

const SESSION_TABLE: Record<SessionKind, string> = {
  referral: 'public.referral_sessions',
  mock: 'public.mock_interview_sessions',
};
const SESSION_RATING_TABLE: Record<SessionKind, string> = {
  referral: 'public.referral_session_ratings',
  mock: 'public.mock_interview_session_ratings',
};

export interface SessionMini {
  id: number;
  requester_id: string;
  referrer_id: string;
  status: string;
  is_rated: boolean;
}

export async function getSession(kind: SessionKind, id: number): Promise<SessionMini | null> {
  const { rows } = await query<SessionMini>(
    `SELECT id, requester_id, referrer_id, status, is_rated FROM ${SESSION_TABLE[kind]} WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function submitSessionRating(
  kind: SessionKind,
  sessionId: number,
  raterId: string,
  referrerId: string,
  rating: number,
  reviewText: string | null,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO ${SESSION_RATING_TABLE[kind]} (session_id, rater_id, referrer_id, rating, review_text)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id) DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text`,
      [sessionId, raterId, referrerId, rating, reviewText],
    );
    await client.query(`UPDATE ${SESSION_TABLE[kind]} SET is_rated = TRUE WHERE id = $1`, [sessionId]);
  });
}

export interface ResumeReviewMini {
  id: number;
  requester_id: string;
  referrer_id: string | null;
  status: string;
  is_rated: boolean;
}

export async function getResumeReview(id: number): Promise<ResumeReviewMini | null> {
  const { rows } = await query<ResumeReviewMini>(
    `SELECT id, requester_id, referrer_id, status, is_rated
       FROM public.resume_review_requests WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function submitResumeRating(
  requestId: number,
  raterId: string,
  referrerId: string,
  rating: number,
  reviewText: string | null,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO public.resume_review_ratings (request_id, rater_id, referrer_id, rating, review_text)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (request_id) DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text`,
      [requestId, raterId, referrerId, rating, reviewText],
    );
    await client.query(`UPDATE public.resume_review_requests SET is_rated = TRUE WHERE id = $1`, [requestId]);
  });
}

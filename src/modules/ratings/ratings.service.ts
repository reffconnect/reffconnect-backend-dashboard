import { AppError } from '../../utils/AppError';
import * as repo from './ratings.repository';
import type { SubmitRatingInput } from './ratings.schema';

export async function rateSession(
  kind: repo.SessionKind,
  sessionId: number,
  raterId: string,
  input: SubmitRatingInput,
): Promise<void> {
  const session = await repo.getSession(kind, sessionId);
  if (!session) throw AppError.notFound('Session not found');
  if (session.requester_id !== raterId) {
    throw AppError.forbidden('Only the person who booked the session can rate it');
  }
  await repo.submitSessionRating(
    kind,
    sessionId,
    raterId,
    session.referrer_id,
    input.rating,
    input.review_text ?? null,
  );
}

export async function rateResumeReview(
  requestId: number,
  raterId: string,
  input: SubmitRatingInput,
): Promise<void> {
  const review = await repo.getResumeReview(requestId);
  if (!review) throw AppError.notFound('Resume review request not found');
  if (review.requester_id !== raterId) {
    throw AppError.forbidden('Only the requester can rate this review');
  }
  if (!review.referrer_id) {
    throw AppError.badRequest('This review has no assigned reviewer to rate');
  }
  await repo.submitResumeRating(requestId, raterId, review.referrer_id, input.rating, input.review_text ?? null);
}

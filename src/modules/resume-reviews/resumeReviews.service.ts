import { AppError } from '../../utils/AppError';
import { withTransaction } from '../../db/pool';
import { getFullName, findReferrerIdByName } from '../../utils/profileLookup';
import { PLATFORM_FIXED_SERVICE_PRICES } from '../services/services.schema';
import { consumeOrderWith, precheckBookingPayment } from '../payments/payments.service';
import * as repo from './resumeReviews.repository';
import type { CreateResumeReviewInput } from './resumeReviews.schema';

export async function createResumeReview(
  requesterId: string,
  input: CreateResumeReviewInput,
): Promise<repo.ResumeReviewRow> {
  const requesterName = await getFullName(requesterId);

  let referrerId = input.referrer_id ?? null;
  if (!referrerId && input.referrer_name) {
    referrerId = await findReferrerIdByName(input.referrer_name);
  }
  if (referrerId && referrerId === requesterId) {
    throw AppError.badRequest('You cannot request a resume review from yourself.');
  }

  const decision = await precheckBookingPayment({ orderId: input.payment_order_id, sellerId: referrerId });

  // Resume review is a platform-fixed price.
  const grossAmount = PLATFORM_FIXED_SERVICE_PRICES['resume-review'] ?? null;

  return withTransaction(async (client) => {
    if (decision === 'consume') {
      await consumeOrderWith(client, {
        orderId: input.payment_order_id as string,
        buyerId: requesterId,
        sellerId: referrerId as string,
        serviceId: 'resume-review',
        refType: 'resume_review_requests',
      });
    }
    return repo.insert(requesterId, requesterName, referrerId, grossAmount, input, client);
  });
}

export async function listMine(requesterId: string): Promise<repo.ResumeReviewRow[]> {
  return repo.listForRequester(requesterId);
}

export async function listIncoming(referrerId: string): Promise<repo.ResumeReviewRow[]> {
  return repo.listForReferrer(referrerId);
}

export async function getById(id: number, viewerId: string): Promise<repo.ResumeReviewRow> {
  const row = await repo.getById(id);
  if (!row) throw AppError.notFound('Resume review request not found');
  if (row.requester_id !== viewerId && row.referrer_id !== viewerId) {
    throw AppError.forbidden('You do not have access to this request');
  }
  return row;
}

export async function decline(id: number, referrerId: string): Promise<repo.ResumeReviewRow> {
  const row = await repo.getById(id);
  if (!row) throw AppError.notFound('Resume review request not found');
  if (row.referrer_id !== referrerId) throw AppError.forbidden('Only the referrer can decline this request');
  const updated = await repo.setStatus(id, 'cancelled');
  if (!updated) throw AppError.notFound('Resume review request not found');
  return updated;
}

export async function submitFeedback(
  id: number,
  referrerId: string,
  feedbackText: string,
): Promise<repo.ResumeReviewRow> {
  const row = await repo.getById(id);
  if (!row) throw AppError.notFound('Resume review request not found');
  if (row.referrer_id !== referrerId) throw AppError.forbidden('Only the referrer can submit feedback');
  const updated = await repo.submitFeedback(id, feedbackText);
  if (!updated) throw AppError.notFound('Resume review request not found');
  return updated;
}

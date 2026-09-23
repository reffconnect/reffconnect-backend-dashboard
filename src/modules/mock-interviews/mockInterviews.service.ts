import { AppError } from '../../utils/AppError';
import { withTransaction } from '../../db/pool';
import { getFullName, findReferrerIdByName } from '../../utils/profileLookup';
import { getActivePrice } from '../services/services.repository';
import { consumeOrderWith, precheckBookingPayment } from '../payments/payments.service';
import * as repo from './mockInterviews.repository';
import type { CreateMockInterviewInput } from './mockInterviews.schema';

export async function createMockInterview(
  requesterId: string,
  input: CreateMockInterviewInput,
): Promise<repo.MockInterviewRequestRow> {
  const requesterName = await getFullName(requesterId);

  let referrerId = input.referrer_id ?? null;
  if (!referrerId && input.referrer_name) {
    referrerId = await findReferrerIdByName(input.referrer_name);
  }
  if (referrerId && referrerId === requesterId) {
    throw AppError.badRequest('You cannot request a mock interview from yourself.');
  }

  const decision = await precheckBookingPayment({ orderId: input.payment_order_id, sellerId: referrerId });
  const grossAmount = referrerId ? await getActivePrice(referrerId, 'interview-mock') : null;

  return withTransaction(async (client) => {
    if (decision === 'consume') {
      await consumeOrderWith(client, {
        orderId: input.payment_order_id as string,
        buyerId: requesterId,
        sellerId: referrerId as string,
        serviceId: 'interview-mock',
        refType: 'mock_interview_requests',
      });
    }
    return repo.insert(requesterId, requesterName, referrerId, grossAmount, input, client);
  });
}

export async function listMine(requesterId: string): Promise<repo.MockInterviewRequestRow[]> {
  return repo.listForRequester(requesterId);
}

export async function listIncoming(referrerId: string): Promise<repo.MockInterviewRequestRow[]> {
  return repo.listForReferrer(referrerId);
}

export async function getById(id: number, viewerId: string): Promise<repo.MockInterviewRequestRow> {
  const row = await repo.getById(id);
  if (!row) throw AppError.notFound('Mock interview request not found');
  if (row.requester_id !== viewerId && row.referrer_id !== viewerId) {
    throw AppError.forbidden('You do not have access to this request');
  }
  return row;
}

export async function decline(id: number, referrerId: string): Promise<repo.MockInterviewRequestRow> {
  const row = await repo.getById(id);
  if (!row) throw AppError.notFound('Mock interview request not found');
  if (row.referrer_id !== referrerId) throw AppError.forbidden('Only the referrer can decline this request');
  const updated = await repo.setStatus(id, 'declined');
  if (!updated) throw AppError.notFound('Mock interview request not found');
  return updated;
}

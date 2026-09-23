import { AppError } from '../../utils/AppError';
import { withTransaction } from '../../db/pool';
import { getFullName, findReferrerIdByName } from '../../utils/profileLookup';
import { getActivePrice } from '../services/services.repository';
import { consumeOrderWith, precheckBookingPayment } from '../payments/payments.service';
import * as repo from './referralRequests.repository';
import type { CreateReferralRequestInput } from './referralRequests.schema';

export async function createReferralRequest(
  requesterId: string,
  input: CreateReferralRequestInput,
): Promise<repo.ReferralRequestRow> {
  const requesterName = await getFullName(requesterId);

  let referrerId = input.referrer_id ?? null;
  if (!referrerId && input.referrer_name) {
    referrerId = await findReferrerIdByName(input.referrer_name);
  }
  if (referrerId && referrerId === requesterId) {
    throw AppError.badRequest('You cannot request a referral from yourself.');
  }

  // Decide the payment gate outside the tx (reads the enforce flag + validates
  // the order's presence); actually consume the order inside the tx alongside
  // the insert so the two commit or roll back together.
  const decision = await precheckBookingPayment({ orderId: input.payment_order_id, sellerId: referrerId });

  // Snapshot the referrer's current referral-session price so accounting doesn't
  // drift if they later edit it.
  const grossAmount = referrerId ? await getActivePrice(referrerId, 'referral-session') : null;

  return withTransaction(async (client) => {
    if (decision === 'consume') {
      await consumeOrderWith(client, {
        orderId: input.payment_order_id as string,
        buyerId: requesterId,
        sellerId: referrerId as string,
        serviceId: 'referral-session',
        refType: 'referral_requests',
      });
    }
    return repo.insert(requesterId, requesterName, referrerId, grossAmount, input, client);
  });
}

export async function listMine(requesterId: string): Promise<repo.ReferralRequestRow[]> {
  return repo.listForRequester(requesterId);
}

export async function listIncoming(referrerId: string): Promise<repo.ReferralRequestRow[]> {
  return repo.listForReferrer(referrerId);
}

export async function getById(id: number, viewerId: string): Promise<repo.ReferralRequestRow> {
  const row = await repo.getById(id);
  if (!row) throw AppError.notFound('Referral request not found');
  if (row.requester_id !== viewerId && row.referrer_id !== viewerId) {
    throw AppError.forbidden('You do not have access to this request');
  }
  return row;
}

export async function decline(id: number, referrerId: string): Promise<repo.ReferralRequestRow> {
  const row = await repo.getById(id);
  if (!row) throw AppError.notFound('Referral request not found');
  if (row.referrer_id !== referrerId) {
    throw AppError.forbidden('Only the referrer can decline this request');
  }
  const updated = await repo.setStatus(id, 'declined');
  if (!updated) throw AppError.notFound('Referral request not found');
  return updated;
}

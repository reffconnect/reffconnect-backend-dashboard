import { AppError } from '../../utils/AppError';
import * as repo from './reservations.repository';
import type { SlotPayload } from './reservations.schema';

const RESERVATION_TTL_MS = 15 * 60 * 1000; // 15-minute checkout lock

export async function reserveSlot(userId: string, payload: SlotPayload): Promise<repo.ReservationRow> {
  if (payload.referrerId === userId) {
    throw AppError.badRequest('You cannot reserve a slot on your own calendar.');
  }
  const conflict = await repo.findActiveConflict(
    payload.referrerId,
    payload.serviceId,
    payload.slotLabel,
    userId,
  );
  if (conflict) {
    throw AppError.conflict('This slot is temporarily locked by another candidate checkout session.');
  }
  return repo.upsertReservation({
    userId,
    referrerId: payload.referrerId,
    serviceId: payload.serviceId,
    slotLabel: payload.slotLabel,
    expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
  });
}

export async function releaseSlot(userId: string, payload: SlotPayload): Promise<void> {
  await repo.release(userId, payload.referrerId, payload.serviceId, payload.slotLabel);
}

export async function getActiveReservations(referrerId: string): Promise<repo.ReservationRow[]> {
  return repo.listActive(referrerId);
}

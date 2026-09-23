import { query } from '../../db/pool';

export interface ReservationRow {
  id: number;
  user_id: string;
  referrer_id: string;
  service_id: string;
  slot_label: string;
  reserved_at: string;
  expires_at: string;
  is_released: boolean;
}

export async function findActiveConflict(
  referrerId: string,
  serviceId: string,
  slotLabel: string,
  excludeUserId: string,
): Promise<ReservationRow | null> {
  const { rows } = await query<ReservationRow>(
    `SELECT * FROM public.slot_reservations
      WHERE referrer_id = $1 AND service_id = $2 AND slot_label = $3
        AND is_released = FALSE AND expires_at > NOW() AND user_id <> $4
      LIMIT 1`,
    [referrerId, serviceId, slotLabel, excludeUserId],
  );
  return rows[0] ?? null;
}

export async function upsertReservation(params: {
  userId: string;
  referrerId: string;
  serviceId: string;
  slotLabel: string;
  expiresAt: Date;
}): Promise<ReservationRow> {
  const { rows } = await query<ReservationRow>(
    `INSERT INTO public.slot_reservations (user_id, referrer_id, service_id, slot_label, expires_at, is_released, reserved_at)
     VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
     ON CONFLICT (referrer_id, service_id, slot_label) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       expires_at = EXCLUDED.expires_at,
       is_released = FALSE,
       reserved_at = NOW()
     RETURNING *`,
    [params.userId, params.referrerId, params.serviceId, params.slotLabel, params.expiresAt.toISOString()],
  );
  if (!rows[0]) throw new Error('Failed to reserve slot');
  return rows[0];
}

export async function release(
  userId: string,
  referrerId: string,
  serviceId: string,
  slotLabel: string,
): Promise<void> {
  await query(
    `UPDATE public.slot_reservations SET is_released = TRUE
      WHERE referrer_id = $1 AND service_id = $2 AND slot_label = $3 AND user_id = $4`,
    [referrerId, serviceId, slotLabel, userId],
  );
}

export async function listActive(referrerId: string): Promise<ReservationRow[]> {
  const { rows } = await query<ReservationRow>(
    `SELECT * FROM public.slot_reservations
      WHERE referrer_id = $1 AND is_released = FALSE AND expires_at > NOW()`,
    [referrerId],
  );
  return rows;
}

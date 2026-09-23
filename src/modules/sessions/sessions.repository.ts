/**
 * Data access shared by referral_sessions and mock_interview_sessions (identical
 * columns). `kind` selects the physical table; it is an internal enum mapped to a
 * constant table name, never client input interpolated raw.
 */
import { query } from '../../db/pool';

export type SessionKind = 'referral' | 'mock';

const TABLE: Record<SessionKind, string> = {
  referral: 'public.referral_sessions',
  mock: 'public.mock_interview_sessions',
};

const BUSY_SERVICE_ID: Record<SessionKind, string> = {
  referral: 'referral-session',
  mock: 'culture-call',
};

export interface SessionRow {
  id: number;
  request_id: number | null;
  requester_id: string;
  referrer_id: string;
  referrer_name: string | null;
  referrer_company: string | null;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  duration_minutes: number;
  reschedule_count: number;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  daily_room_name: string | null;
  daily_room_url: string | null;
  is_rated: boolean;
  gross_amount: number | null;
  created_at: string;
  updated_at: string;
}

export interface BusySlot {
  service_id: string;
  scheduled_start: string;
  scheduled_end: string;
  duration_minutes: number;
  status: string;
}

export async function insertSession(
  kind: SessionKind,
  input: {
    request_id: number | null;
    requester_id: string;
    referrer_id: string;
    referrer_name?: string | null;
    referrer_company?: string | null;
    scheduled_start: string;
    scheduled_end: string;
    duration_minutes: number;
  },
): Promise<SessionRow> {
  const { rows } = await query<SessionRow>(
    `INSERT INTO ${TABLE[kind]}
       (request_id, requester_id, referrer_id, referrer_name, referrer_company, status,
        scheduled_start, scheduled_end, duration_minutes)
     VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8)
     RETURNING *`,
    [
      input.request_id,
      input.requester_id,
      input.referrer_id,
      input.referrer_name ?? null,
      input.referrer_company ?? null,
      input.scheduled_start,
      input.scheduled_end,
      input.duration_minutes,
    ],
  );
  if (!rows[0]) throw new Error('Failed to schedule session');
  return rows[0];
}

export async function getById(kind: SessionKind, id: number): Promise<SessionRow | null> {
  const { rows } = await query<SessionRow>(`SELECT * FROM ${TABLE[kind]} WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function listForUser(kind: SessionKind, userId: string): Promise<SessionRow[]> {
  const { rows } = await query<SessionRow>(
    `SELECT * FROM ${TABLE[kind]} WHERE requester_id = $1 OR referrer_id = $1 ORDER BY scheduled_start DESC`,
    [userId],
  );
  return rows;
}

export async function reschedule(
  kind: SessionKind,
  id: number,
  scheduledStart: string,
  scheduledEnd: string,
  durationMinutes: number | null,
): Promise<SessionRow | null> {
  const { rows } = await query<SessionRow>(
    `UPDATE ${TABLE[kind]}
        SET scheduled_start = $2, scheduled_end = $3,
            duration_minutes = COALESCE($4, duration_minutes),
            status = 'rescheduled', reschedule_count = reschedule_count + 1
      WHERE id = $1
      RETURNING *`,
    [id, scheduledStart, scheduledEnd, durationMinutes],
  );
  return rows[0] ?? null;
}

export async function cancel(
  kind: SessionKind,
  id: number,
  cancelledBy: string,
  reason: string | null,
): Promise<SessionRow | null> {
  const { rows } = await query<SessionRow>(
    `UPDATE ${TABLE[kind]}
        SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2, cancel_reason = $3
      WHERE id = $1
      RETURNING *`,
    [id, cancelledBy, reason],
  );
  return rows[0] ?? null;
}

export async function getBusySlots(kind: SessionKind, referrerId: string): Promise<BusySlot[]> {
  const { rows } = await query<BusySlot>(
    `SELECT $2::text AS service_id, scheduled_start, scheduled_end, duration_minutes, status
       FROM ${TABLE[kind]}
      WHERE referrer_id = $1 AND status IN ('scheduled', 'rescheduled') AND scheduled_end > NOW()
      ORDER BY scheduled_start ASC`,
    [referrerId, BUSY_SERVICE_ID[kind]],
  );
  return rows;
}

/** Advance past-window sessions to completed. Safe to run repeatedly (cron sweep). */
export async function autoCompletePast(kind: SessionKind): Promise<number> {
  const { rowCount } = await query(
    `UPDATE ${TABLE[kind]} SET status = 'completed'
      WHERE scheduled_end < NOW() AND status IN ('scheduled', 'rescheduled')`,
  );
  return rowCount ?? 0;
}

export async function setDailyRoom(
  kind: SessionKind,
  id: number,
  roomName: string,
  roomUrl: string,
): Promise<void> {
  await query(`UPDATE ${TABLE[kind]} SET daily_room_name = $2, daily_room_url = $3 WHERE id = $1`, [
    id,
    roomName,
    roomUrl,
  ]);
}

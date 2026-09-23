import { AppError } from '../../utils/AppError';
import * as repo from './sessions.repository';
import type { RescheduleSessionInput, ScheduleSessionInput } from './sessions.schema';

function assertParticipant(session: repo.SessionRow, userId: string): void {
  if (session.requester_id !== userId && session.referrer_id !== userId) {
    throw AppError.forbidden('You are not a participant in this session');
  }
}

export async function schedule(
  kind: repo.SessionKind,
  callerId: string,
  input: ScheduleSessionInput,
): Promise<repo.SessionRow> {
  if (callerId !== input.requester_id && callerId !== input.referrer_id) {
    throw AppError.forbidden('You can only schedule sessions you are part of');
  }
  if (input.requester_id === input.referrer_id) {
    throw AppError.badRequest('A session needs two distinct participants');
  }
  return repo.insertSession(kind, {
    request_id: input.request_id ?? null,
    requester_id: input.requester_id,
    referrer_id: input.referrer_id,
    referrer_name: input.referrer_name ?? null,
    referrer_company: input.referrer_company ?? null,
    scheduled_start: input.scheduled_start,
    scheduled_end: input.scheduled_end,
    duration_minutes: input.duration_minutes,
  });
}

export async function listMine(kind: repo.SessionKind, userId: string): Promise<repo.SessionRow[]> {
  // Best-effort sweep so past sessions read as completed.
  await repo.autoCompletePast(kind).catch(() => undefined);
  return repo.listForUser(kind, userId);
}

export async function getById(
  kind: repo.SessionKind,
  id: number,
  viewerId: string,
): Promise<repo.SessionRow> {
  const session = await repo.getById(kind, id);
  if (!session) throw AppError.notFound('Session not found');
  assertParticipant(session, viewerId);
  return session;
}

export async function reschedule(
  kind: repo.SessionKind,
  id: number,
  callerId: string,
  input: RescheduleSessionInput,
): Promise<repo.SessionRow> {
  const session = await repo.getById(kind, id);
  if (!session) throw AppError.notFound('Session not found');
  assertParticipant(session, callerId);
  if (session.status === 'cancelled' || session.status === 'completed') {
    throw AppError.badRequest(`A ${session.status} session cannot be rescheduled`);
  }
  const updated = await repo.reschedule(
    kind,
    id,
    input.scheduled_start,
    input.scheduled_end,
    input.duration_minutes ?? null,
  );
  if (!updated) throw AppError.notFound('Session not found');
  return updated;
}

export async function cancel(
  kind: repo.SessionKind,
  id: number,
  callerId: string,
  reason: string | null,
): Promise<repo.SessionRow> {
  const session = await repo.getById(kind, id);
  if (!session) throw AppError.notFound('Session not found');
  assertParticipant(session, callerId);
  if (session.status === 'completed') throw AppError.badRequest('A completed session cannot be cancelled');
  const updated = await repo.cancel(kind, id, callerId, reason);
  if (!updated) throw AppError.notFound('Session not found');
  return updated;
}

export async function busySlots(
  kind: repo.SessionKind,
  referrerId: string,
): Promise<repo.BusySlot[]> {
  await repo.autoCompletePast(kind).catch(() => undefined);
  return repo.getBusySlots(kind, referrerId);
}

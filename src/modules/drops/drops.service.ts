import { AppError } from '../../utils/AppError';
import * as repo from './drops.repository';
import { screenCard } from './drops.screening';
import type { SubmitCardInput } from './drops.schema';

async function attachPacket(card: repo.DropCardRow): Promise<repo.DropCardRow & { screening_packet: unknown }> {
  const packet = await repo.getLatestPacket(card.id);
  return { ...card, screening_packet: packet };
}

export async function getActiveDrops(companySearch?: string): Promise<repo.DropRow[]> {
  return repo.listActiveDrops(companySearch);
}

export async function submitCard(
  studentUserId: string,
  input: SubmitCardInput,
): Promise<{ card: repo.DropCardRow; screening: Awaited<ReturnType<typeof screenCard>> }> {
  const card = await repo.insertCard(studentUserId, {
    drop_id: input.drop_id ?? null,
    company_name: input.company_name,
    target_job_req_id: input.target_job_req_id ?? null,
    target_job_url: input.target_job_url ?? null,
    resume_url: input.resume_url ?? null,
    pitch_text: input.pitch_text ?? null,
    leetcode_url: input.leetcode_url ?? null,
    github_url: input.github_url ?? null,
    project_demo_url: input.project_demo_url ?? null,
    job_description_text: input.job_description_text ?? null,
    job_description_source: input.job_description_source ?? null,
    metadata: input.metadata ?? {},
  });

  // Screen before any professional sees the card. Failure leaves it unassigned.
  const screening = await screenCard(card.id);
  const refreshed = (await repo.getCardById(card.id)) ?? card;
  return { card: refreshed, screening };
}

export async function getMyCards(studentUserId: string): Promise<Array<Record<string, unknown>>> {
  const cards = await repo.listMyCards(studentUserId);
  return Promise.all(cards.map(attachPacket));
}

export async function confirmReceipt(cardId: string, userId: string): Promise<repo.DropCardRow> {
  const card = await repo.getCardById(cardId);
  if (!card) throw AppError.notFound('Drop card not found');
  if (card.student_user_id !== userId) throw AppError.forbidden('This card belongs to another candidate');
  const updated = await repo.updateCard(cardId, {
    referral_confirmed_at: new Date().toISOString(),
    status: 'referred',
  });
  if (!updated) throw AppError.notFound('Drop card not found');
  return updated;
}

export async function getAssignedCards(referrerId: string): Promise<Array<Record<string, unknown>>> {
  const cards = await repo.listAssignedCards(referrerId);
  return Promise.all(cards.map(attachPacket));
}

async function requireAssigned(cardId: string, referrerId: string): Promise<repo.DropCardRow> {
  const card = await repo.getCardById(cardId);
  if (!card) throw AppError.notFound('Drop card not found');
  if (card.assigned_referrer_id !== referrerId) {
    throw AppError.forbidden('This card is not assigned to you');
  }
  return card;
}

export async function acceptCard(
  cardId: string,
  referrerId: string,
  hrReferenceId: string,
): Promise<repo.DropCardRow> {
  await requireAssigned(cardId, referrerId);
  const updated = await repo.updateCard(cardId, { status: 'accepted', hr_reference_id: hrReferenceId });
  if (!updated) throw AppError.notFound('Drop card not found');
  return updated;
}

export async function askCandidate(
  cardId: string,
  referrerId: string,
  question: string,
): Promise<repo.DropCardRow> {
  await requireAssigned(cardId, referrerId);
  const updated = await repo.updateCard(cardId, { candidate_question: question });
  if (!updated) throw AppError.notFound('Drop card not found');
  return updated;
}

export async function passCard(cardId: string, referrerId: string, reason: string): Promise<repo.DropCardRow> {
  await requireAssigned(cardId, referrerId);
  const updated = await repo.updateCard(cardId, { status: 'passed', pass_reason: reason });
  if (!updated) throw AppError.notFound('Drop card not found');
  return updated;
}

export async function getPreferences(userId: string): Promise<repo.DropPreferencesRow | null> {
  return repo.getPreferences(userId);
}

export async function savePreferences(
  userId: string,
  prefs: { companies?: string[]; roles?: string[]; is_active?: boolean; metadata?: Record<string, unknown> },
): Promise<repo.DropPreferencesRow> {
  return repo.upsertPreferences(userId, prefs);
}

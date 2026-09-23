import { AppError } from '../../utils/AppError';
import { generateUniqueUserCode } from '../../utils/userCode';
import * as repo from './upgrades.repository';

/** Turns a verified work-email domain into a display company label (acme.com -> Acme). */
function companyLabelFromDomain(domain: string): string {
  const base = domain.split('.')[0] ?? domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export async function createUpgradeRequest(
  userId: string,
  companyName: string | undefined,
  referrerCode: string | undefined,
): Promise<repo.UpgradeRequestRow> {
  const profile = await repo.getProfileRoleInfo(userId);
  if (profile?.role === 'referrer') {
    throw AppError.badRequest('You are already a referrer');
  }
  return repo.insertUpgradeRequest(userId, companyName ?? null, referrerCode ?? null, 'pending');
}

export async function getMyUpgradeRequest(userId: string): Promise<repo.UpgradeRequestRow | null> {
  return repo.getLatestForUser(userId);
}

/**
 * Self-serve upgrade backed by a verified work email (mirrors self_upgrade_to_referrer).
 * Requires OTP-proven employment; promotes the profile immediately.
 */
export async function selfUpgrade(
  userId: string,
  companyName: string | undefined,
  referrerCode: string | undefined,
): Promise<{ upgrade_request_id: number; user_code: string | null; verified_domain: string }> {
  const verifiedDomain = await repo.getVerifiedWorkEmailDomain(userId);
  if (!verifiedDomain) {
    throw AppError.badRequest('Verify your work email before upgrading to a referrer account');
  }

  const profile = await repo.getProfileRoleInfo(userId);
  const resolvedCompany = companyName?.trim() || profile?.company_name || companyLabelFromDomain(verifiedDomain);
  const userCode = profile?.user_code ?? (await generateUniqueUserCode('REFFJR'));

  const request = await repo.insertUpgradeRequest(userId, resolvedCompany, referrerCode ?? null, 'approved');
  const approved = await repo.approveAndPromote(
    request.id,
    userId,
    resolvedCompany,
    userCode,
    'self-upgrade via verified work email',
  );

  return {
    upgrade_request_id: approved.id,
    user_code: userCode,
    verified_domain: verifiedDomain,
  };
}

export async function listPending(): Promise<repo.UpgradeRequestRow[]> {
  return repo.listPending();
}

export async function approve(
  requestId: number,
  adminNotes: string | undefined,
): Promise<repo.UpgradeRequestRow> {
  const request = await repo.getById(requestId);
  if (!request) throw AppError.notFound('Upgrade request not found');
  const profile = await repo.getProfileRoleInfo(request.user_id);
  const userCode = profile?.user_code ?? (await generateUniqueUserCode('REFFJR'));
  return repo.approveAndPromote(
    requestId,
    request.user_id,
    request.company_name,
    userCode,
    adminNotes ?? null,
  );
}

export async function reject(
  requestId: number,
  adminNotes: string | undefined,
): Promise<repo.UpgradeRequestRow> {
  const updated = await repo.reject(requestId, adminNotes ?? null);
  if (!updated) throw AppError.notFound('Upgrade request not found');
  return updated;
}

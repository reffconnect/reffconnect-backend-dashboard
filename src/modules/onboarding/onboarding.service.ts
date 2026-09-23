/**
 * Onboarding orchestration. Mirrors api.saveOnboarding: upserts the onboarding
 * row, syncs derived profile fields, assigns a user_code, and (for working
 * professionals) seeds a default resume-review service config and flips role.
 * Working professionals are marked verification_status='pending'.
 */
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { generateUniqueUserCode } from '../../utils/userCode';
import * as repo from './onboarding.repository';
import type { OnboardingInput, UpdateOnboardingInput } from './onboarding.schema';

export async function saveOnboarding(
  userId: string,
  input: OnboardingInput,
): Promise<repo.OnboardingRow> {
  const isWorkingProfessional = input.user_type === 'working_professional';

  const onboarding = await repo.upsertOnboarding(userId, {
    aadhaar_number: input.aadhaar_number ?? null,
    pan_number: input.pan_number ?? null,
    github_link: input.github_link ?? null,
    linkedin_profile_link: input.linkedin_profile_link ?? null,
    country: input.country,
    state: input.state,
    city: input.city,
    contact_number: input.contact_number,
    company_name: input.company_name ?? null,
    company_email: input.company_email ?? null,
    user_type: input.user_type ?? null,
    verification_status: isWorkingProfessional ? 'pending' : null,
    completed_at: new Date().toISOString(),
  });

  const profileUpdates: Record<string, unknown> = {
    location: [input.city, input.state, input.country].filter(Boolean).join(', '),
    company_name: input.company_name ?? null,
    mobile_number: input.contact_number,
    linkedin_url: input.linkedin_profile_link ?? null,
  };
  if (input.github_link) profileUpdates.github_link = input.github_link;

  // office_email: only mark verified when it matches the OTP-proven address.
  const proposedOfficeEmail = (input.official_email || input.company_email || '').trim().toLowerCase();
  if (proposedOfficeEmail) {
    const proof = await repo.getVerifiedWorkEmail(userId);
    const provenEmail = (proof?.email || '').toLowerCase();
    if (provenEmail && provenEmail === proposedOfficeEmail) {
      profileUpdates.office_email = proposedOfficeEmail;
      profileUpdates.office_email_verified = true;
      profileUpdates.office_email_verified_at = proof?.verified_at ?? new Date().toISOString();
    } else if (!provenEmail) {
      profileUpdates.office_email = proposedOfficeEmail;
      profileUpdates.office_email_verified = false;
      profileUpdates.office_email_verified_at = null;
    }
  }

  if (input.consented_at) {
    profileUpdates.consented_at = input.consented_at;
    profileUpdates.consent_version = input.consent_version ?? 'v1.0';
    profileUpdates.is_adult = input.is_adult ?? false;
  }

  if (isWorkingProfessional) {
    profileUpdates.role = 'referrer';
    profileUpdates.user_type = 'working_professional';
    profileUpdates.is_verified = true;
  } else {
    profileUpdates.role = 'job_seeker';
    profileUpdates.user_type = 'student';
    profileUpdates.is_verified = true;
  }

  if (!(await repo.profileHasUserCode(userId))) {
    const prefix = isWorkingProfessional ? 'REFFR' : 'REEFJS';
    profileUpdates.user_code = await generateUniqueUserCode(prefix);
  }

  await repo.applyProfileOnboarding(userId, profileUpdates);

  if (isWorkingProfessional) {
    try {
      await repo.ensureDefaultResumeReviewConfig(userId);
    } catch (err) {
      logger.warn('saveOnboarding: default resume-review config skipped', err instanceof Error ? err.message : err);
    }
  }

  return onboarding;
}

export async function getOnboarding(userId: string): Promise<repo.OnboardingRow | null> {
  return repo.getOnboarding(userId);
}

export async function updateOnboarding(
  userId: string,
  input: UpdateOnboardingInput,
): Promise<repo.OnboardingRow> {
  const updated = await repo.updateOnboardingFields(userId, input as Record<string, unknown>);
  if (!updated) throw AppError.notFound('Onboarding record not found');
  return updated;
}

export async function getVerificationStatus(userId: string): Promise<{
  verification_status: 'pending' | 'approved' | 'rejected' | null;
  admin_notes: string | null;
  user_type: string | null;
}> {
  const row = await repo.getOnboarding(userId);
  return {
    verification_status: row?.verification_status ?? null,
    admin_notes: row?.admin_notes ?? null,
    user_type: row?.user_type ?? null,
  };
}

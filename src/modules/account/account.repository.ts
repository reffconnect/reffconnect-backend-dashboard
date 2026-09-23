import { query } from '../../db/pool';

export async function exportData(userId: string): Promise<Record<string, unknown>> {
  const [profile, onboarding, referrals, resumeReviews, mocks, jobApplications] = await Promise.all([
    query(`SELECT * FROM public.profiles WHERE id = $1`, [userId]),
    query(`SELECT * FROM public.user_onboarding WHERE user_id = $1`, [userId]),
    query(`SELECT * FROM public.referral_requests WHERE requester_id = $1`, [userId]),
    query(`SELECT * FROM public.resume_review_requests WHERE requester_id = $1`, [userId]),
    query(`SELECT * FROM public.mock_interview_requests WHERE requester_id = $1`, [userId]),
    query(`SELECT * FROM public.job_applications WHERE user_id = $1`, [userId]),
  ]);
  return {
    profile: profile.rows[0] ?? null,
    onboarding: onboarding.rows[0] ?? null,
    referral_requests: referrals.rows,
    resume_review_requests: resumeReviews.rows,
    mock_interview_requests: mocks.rows,
    job_applications: jobApplications.rows,
    exported_at: new Date().toISOString(),
  };
}

/** Deletes the auth user; all owned rows cascade via FK ON DELETE CASCADE. */
export async function deleteUser(userId: string): Promise<void> {
  await query(`DELETE FROM public.users WHERE id = $1`, [userId]);
}

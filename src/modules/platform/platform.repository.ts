import { query } from '../../db/pool';

export interface PlatformStats {
  resumes_graded_week: number;
  sessions_completed_total: number;
  active_referrers: number;
}

export async function getStats(): Promise<PlatformStats> {
  const { rows } = await query<Record<keyof PlatformStats, number>>(
    `SELECT
       (SELECT COUNT(*) FROM public.resume_review_requests
          WHERE status = 'feedback_delivered' AND created_at > NOW() - INTERVAL '7 days') AS resumes_graded_week,
       (
         (SELECT COUNT(*) FROM public.referral_sessions WHERE status = 'completed')
         + (SELECT COUNT(*) FROM public.mock_interview_sessions WHERE status = 'completed')
       ) AS sessions_completed_total,
       (SELECT COUNT(*) FROM public.profiles WHERE role = 'referrer' AND is_active = TRUE) AS active_referrers`,
  );
  const row = rows[0];
  return {
    resumes_graded_week: Number(row?.resumes_graded_week ?? 0),
    sessions_completed_total: Number(row?.sessions_completed_total ?? 0),
    active_referrers: Number(row?.active_referrers ?? 0),
  };
}

export async function listFeatures(): Promise<Array<{ feature_key: string; enabled: boolean }>> {
  const { rows } = await query<{ feature_key: string; enabled: boolean }>(
    `SELECT feature_key, enabled FROM public.platform_features ORDER BY feature_key`,
  );
  return rows;
}

export async function getReferrerDashboard(userId: string): Promise<unknown[]> {
  const { rows } = await query(
    `SELECT * FROM public.referral_requests WHERE referrer_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getJobseekerDashboard(userId: string): Promise<unknown[]> {
  const { rows } = await query(
    `SELECT a.*, row_to_json(j.*) AS job
       FROM public.job_applications a
       JOIN public.jobs j ON j.id = a.job_id
      WHERE a.user_id = $1
      ORDER BY a.created_at DESC`,
    [userId],
  );
  return rows;
}

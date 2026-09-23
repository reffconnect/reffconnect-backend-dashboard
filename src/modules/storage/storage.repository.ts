import { query } from '../../db/pool';

export type ResumeService = 'referral' | 'resume_review';

const TABLE: Record<ResumeService, string> = {
  referral: 'public.referral_requests',
  resume_review: 'public.resume_review_requests',
};

export async function getResumePath(service: ResumeService, requestId: number): Promise<string | null> {
  const { rows } = await query<{ resume_file_path: string | null }>(
    `SELECT resume_file_path FROM ${TABLE[service]} WHERE id = $1 LIMIT 1`,
    [requestId],
  );
  return rows[0]?.resume_file_path ?? null;
}

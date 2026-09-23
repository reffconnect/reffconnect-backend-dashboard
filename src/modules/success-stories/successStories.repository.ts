import { query } from '../../db/pool';

export interface SuccessStoryRow {
  id: number;
  user_id: string;
  referrer_id: string | null;
  title: string | null;
  story_text: string | null;
  company_name: string | null;
  role_title: string | null;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  referrer_name?: string | null;
}

export async function insert(
  userId: string,
  input: {
    referrer_id: string | null;
    title: string | null;
    story_text: string | null;
    company_name: string | null;
    role_title: string | null;
  },
): Promise<SuccessStoryRow> {
  const { rows } = await query<SuccessStoryRow>(
    `INSERT INTO public.success_stories (user_id, referrer_id, title, story_text, company_name, role_title, is_approved)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING *`,
    [userId, input.referrer_id, input.title, input.story_text, input.company_name, input.role_title],
  );
  if (!rows[0]) throw new Error('Failed to create success story');
  return rows[0];
}

export async function listApproved(): Promise<SuccessStoryRow[]> {
  const { rows } = await query<SuccessStoryRow>(
    `SELECT s.*, ref.full_name AS referrer_name
       FROM public.success_stories s
       LEFT JOIN public.profiles ref ON ref.id = s.referrer_id
      WHERE s.is_approved = TRUE
      ORDER BY s.created_at DESC`,
  );
  return rows;
}

export async function listForReferrer(referrerId: string): Promise<SuccessStoryRow[]> {
  const { rows } = await query<SuccessStoryRow>(
    `SELECT s.*, author.full_name AS author_name
       FROM public.success_stories s
       LEFT JOIN public.profiles author ON author.id = s.user_id
      WHERE s.referrer_id = $1 AND s.is_approved = TRUE
      ORDER BY s.created_at DESC`,
    [referrerId],
  );
  return rows;
}

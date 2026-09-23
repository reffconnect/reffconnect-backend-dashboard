import { query } from '../../db/pool';

const PUBLIC_PROFILE_COLUMNS = `
  p.id, p.full_name, p.designation, p.company_name, p.location, p.role, p.is_active, p.is_verified,
  p.profile_picture, p.linkedin_url, p.github_link, p.portfolio_url, p.bio, p.skills, p.industry,
  p.languages, p.years_of_experience, p.work_modes, p.notice_period, p.availability_status,
  p.preferred_locations, p.education_entries, p.project_entries, p.certification_entries,
  p.work_history_entries, p.achievement_entries, p.hobbies, p.user_code, p.verified_company_domain,
  p.created_at
`;

export interface ReferrerCard {
  id: string;
  full_name: string;
  designation: string | null;
  company_name: string | null;
  rating: number | null;
  reviews_count: number;
  rank_score: number | null;
  [key: string]: unknown;
}

/**
 * Active referrers with aggregated ratings across all three rating surfaces
 * (replaces get_referrer_rank_scores / get_referrer_ratings). rank_score is a
 * simple normalized rating; a richer multi-signal score can replace it later.
 */
export async function listReferrers(): Promise<ReferrerCard[]> {
  const { rows } = await query<ReferrerCard>(
    `WITH all_ratings AS (
       SELECT referrer_id, rating FROM public.referral_session_ratings
       UNION ALL
       SELECT referrer_id, rating FROM public.mock_interview_session_ratings
       UNION ALL
       SELECT referrer_id, rating FROM public.resume_review_ratings
     ),
     agg AS (
       SELECT referrer_id,
              AVG(rating)::float8 AS average_rating,
              COUNT(*)::int       AS reviews_count
       FROM all_ratings
       GROUP BY referrer_id
     )
     SELECT ${PUBLIC_PROFILE_COLUMNS},
            a.average_rating AS rating,
            COALESCE(a.reviews_count, 0) AS reviews_count,
            CASE WHEN a.average_rating IS NULL THEN NULL ELSE a.average_rating / 5.0 END AS rank_score
       FROM public.profiles p
       LEFT JOIN agg a ON a.referrer_id = p.id
      WHERE p.role = 'referrer' AND p.is_active = TRUE
      ORDER BY COALESCE(a.average_rating, 0) DESC, p.created_at DESC`,
  );
  return rows;
}

export interface ReviewerRow {
  reviewer_id: string;
  display_name: string;
  avatar_url: string | null;
  rating: number | null;
  review_text: string | null;
  reviewed_at: string | null;
}

export async function listReviewers(referrerId: string, limit: number): Promise<ReviewerRow[]> {
  const { rows } = await query<ReviewerRow>(
    `WITH reviews AS (
       SELECT rater_id, referrer_id, rating, review_text, created_at
         FROM public.referral_session_ratings
       UNION ALL
       SELECT rater_id, referrer_id, rating, review_text, created_at
         FROM public.mock_interview_session_ratings
       UNION ALL
       SELECT rater_id, referrer_id, rating, review_text, created_at
         FROM public.resume_review_ratings
     )
     SELECT r.rater_id            AS reviewer_id,
            COALESCE(p.full_name, '') AS display_name,
            p.profile_picture     AS avatar_url,
            r.rating              AS rating,
            r.review_text         AS review_text,
            r.created_at          AS reviewed_at
       FROM reviews r
       LEFT JOIN public.profiles p ON p.id = r.rater_id
      WHERE r.referrer_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2`,
    [referrerId, limit],
  );
  return rows;
}

export async function countReviewers(referrerId: string): Promise<number> {
  const { rows } = await query<{ total: number }>(
    `WITH reviews AS (
       SELECT rater_id, referrer_id FROM public.referral_session_ratings
       UNION ALL SELECT rater_id, referrer_id FROM public.mock_interview_session_ratings
       UNION ALL SELECT rater_id, referrer_id FROM public.resume_review_ratings
     )
     SELECT COUNT(DISTINCT rater_id)::int AS total FROM reviews WHERE referrer_id = $1`,
    [referrerId],
  );
  return rows[0]?.total ?? 0;
}

export interface UserCard {
  id: string;
  full_name: string;
  designation: string | null;
  company_name: string | null;
  profile_picture: string | null;
  user_code: string | null;
  role: string;
  is_verified: boolean;
  bio: string | null;
  skills: string[] | null;
}

export async function getUserByUserCode(code: string): Promise<UserCard | null> {
  const { rows } = await query<UserCard>(
    `SELECT id, full_name, designation, company_name, profile_picture, user_code, role,
            is_verified, bio, skills
       FROM public.profiles
      WHERE user_code = $1
      LIMIT 1`,
    [code.toUpperCase().trim()],
  );
  return rows[0] ?? null;
}

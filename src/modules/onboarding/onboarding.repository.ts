import { query } from '../../db/pool';

export interface OnboardingRow {
  id: string;
  user_id: string;
  aadhaar_number: string | null;
  pan_number: string | null;
  github_link: string | null;
  linkedin_profile_link: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  contact_number: string | null;
  company_name: string | null;
  company_email: string | null;
  company_email_verified: boolean;
  company_email_verified_at: string | null;
  user_type: string | null;
  verification_status: 'pending' | 'approved' | 'rejected' | null;
  admin_notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const ONBOARDING_PROFILE_COLUMNS = new Set([
  'location',
  'company_name',
  'mobile_number',
  'linkedin_url',
  'github_link',
  'office_email',
  'office_email_verified',
  'office_email_verified_at',
  'role',
  'user_type',
  'is_verified',
  'consented_at',
  'consent_version',
  'is_adult',
  'user_code',
]);

export async function getOnboarding(userId: string): Promise<OnboardingRow | null> {
  const { rows } = await query<OnboardingRow>(
    `SELECT * FROM public.user_onboarding WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function upsertOnboarding(
  userId: string,
  data: {
    aadhaar_number?: string | null;
    pan_number?: string | null;
    github_link?: string | null;
    linkedin_profile_link?: string | null;
    country?: string | null;
    state?: string | null;
    city?: string | null;
    contact_number?: string | null;
    company_name?: string | null;
    company_email?: string | null;
    user_type?: string | null;
    verification_status?: string | null;
    completed_at?: string | null;
  },
): Promise<OnboardingRow> {
  const { rows } = await query<OnboardingRow>(
    `INSERT INTO public.user_onboarding
       (user_id, aadhaar_number, pan_number, github_link, linkedin_profile_link,
        country, state, city, contact_number, company_name, company_email,
        user_type, verification_status, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (user_id) DO UPDATE SET
       aadhaar_number = EXCLUDED.aadhaar_number,
       pan_number = EXCLUDED.pan_number,
       github_link = EXCLUDED.github_link,
       linkedin_profile_link = EXCLUDED.linkedin_profile_link,
       country = EXCLUDED.country,
       state = EXCLUDED.state,
       city = EXCLUDED.city,
       contact_number = EXCLUDED.contact_number,
       company_name = EXCLUDED.company_name,
       company_email = EXCLUDED.company_email,
       user_type = EXCLUDED.user_type,
       verification_status = EXCLUDED.verification_status,
       completed_at = EXCLUDED.completed_at
     RETURNING *`,
    [
      userId,
      data.aadhaar_number ?? null,
      data.pan_number ?? null,
      data.github_link ?? null,
      data.linkedin_profile_link ?? null,
      data.country ?? null,
      data.state ?? null,
      data.city ?? null,
      data.contact_number ?? null,
      data.company_name ?? null,
      data.company_email ?? null,
      data.user_type ?? null,
      data.verification_status ?? null,
      data.completed_at ?? null,
    ],
  );
  if (!rows[0]) throw new Error('Failed to upsert onboarding');
  return rows[0];
}

export async function updateOnboardingFields(
  userId: string,
  fields: Record<string, unknown>,
): Promise<OnboardingRow | null> {
  const allowed = new Set([
    'aadhaar_number',
    'pan_number',
    'github_link',
    'linkedin_profile_link',
    'country',
    'state',
    'city',
    'contact_number',
    'company_name',
    'company_email',
    'user_type',
  ]);
  const keys = Object.keys(fields).filter((k) => allowed.has(k));
  if (keys.length === 0) return getOnboarding(userId);
  const values: unknown[] = [userId];
  const set = keys.map((k) => {
    values.push(fields[k]);
    return `${k} = $${values.length}`;
  });
  const { rows } = await query<OnboardingRow>(
    `UPDATE public.user_onboarding SET ${set.join(', ')} WHERE user_id = $1 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function getVerifiedWorkEmail(
  userId: string,
): Promise<{ email: string; email_domain: string; verified_at: string } | null> {
  const { rows } = await query<{ email: string; email_domain: string; verified_at: string }>(
    `SELECT email, email_domain, verified_at FROM public.verified_work_emails WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/** Applies a whitelisted set of profile columns during onboarding. */
export async function applyProfileOnboarding(
  userId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const keys = Object.keys(updates).filter((k) => ONBOARDING_PROFILE_COLUMNS.has(k));
  if (keys.length === 0) return;
  const values: unknown[] = [userId];
  const set = keys.map((k) => {
    values.push(updates[k]);
    return `${k} = $${values.length}`;
  });
  await query(`UPDATE public.profiles SET ${set.join(', ')} WHERE id = $1`, values);
}

/** Ensures a working professional has an active resume-review service config. */
export async function ensureDefaultResumeReviewConfig(userId: string): Promise<void> {
  await query(
    `INSERT INTO public.service_configurations (user_id, service_id, availability, price, is_active)
     VALUES ($1, 'resume-review', '{}'::jsonb, 299, TRUE)
     ON CONFLICT (user_id, service_id) DO NOTHING`,
    [userId],
  );
}

export async function profileHasUserCode(userId: string): Promise<boolean> {
  const { rows } = await query<{ has_code: boolean }>(
    `SELECT (user_code IS NOT NULL) AS has_code FROM public.profiles WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.has_code ?? false;
}

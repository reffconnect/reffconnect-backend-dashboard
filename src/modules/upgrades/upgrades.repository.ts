import { query, withTransaction } from '../../db/pool';

export interface UpgradeRequestRow {
  id: number;
  user_id: string;
  company_name: string | null;
  referrer_code: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileRoleInfo {
  role: string;
  company_name: string | null;
  user_code: string | null;
}

export async function getProfileRoleInfo(userId: string): Promise<ProfileRoleInfo | null> {
  const { rows } = await query<ProfileRoleInfo>(
    `SELECT role, company_name, user_code FROM public.profiles WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getVerifiedWorkEmailDomain(userId: string): Promise<string | null> {
  const { rows } = await query<{ email_domain: string }>(
    `SELECT email_domain FROM public.verified_work_emails WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.email_domain ?? null;
}

export async function insertUpgradeRequest(
  userId: string,
  companyName: string | null,
  referrerCode: string | null,
  status: 'pending' | 'approved' = 'pending',
): Promise<UpgradeRequestRow> {
  const { rows } = await query<UpgradeRequestRow>(
    `INSERT INTO public.referrer_upgrade_requests (user_id, company_name, referrer_code, status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, companyName, referrerCode, status],
  );
  if (!rows[0]) throw new Error('Failed to create upgrade request');
  return rows[0];
}

export async function getLatestForUser(userId: string): Promise<UpgradeRequestRow | null> {
  const { rows } = await query<UpgradeRequestRow>(
    `SELECT * FROM public.referrer_upgrade_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function listPending(): Promise<UpgradeRequestRow[]> {
  const { rows } = await query<UpgradeRequestRow>(
    `SELECT * FROM public.referrer_upgrade_requests WHERE status = 'pending' ORDER BY created_at ASC`,
  );
  return rows;
}

export async function getById(id: number): Promise<UpgradeRequestRow | null> {
  const { rows } = await query<UpgradeRequestRow>(
    `SELECT * FROM public.referrer_upgrade_requests WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Promote a user to referrer and mark their upgrade request approved, atomically. */
export async function approveAndPromote(
  requestId: string | number,
  userId: string,
  companyName: string | null,
  userCode: string | null,
  adminNotes: string | null,
): Promise<UpgradeRequestRow> {
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE public.profiles
          SET role = 'referrer', user_type = 'working_professional', is_verified = TRUE,
              company_name = COALESCE($2, company_name),
              user_code = COALESCE(user_code, $3)
        WHERE id = $1`,
      [userId, companyName, userCode],
    );
    await client.query(
      `INSERT INTO public.service_configurations (user_id, service_id, availability, price, is_active)
       VALUES ($1, 'resume-review', '{}'::jsonb, 299, TRUE)
       ON CONFLICT (user_id, service_id) DO NOTHING`,
      [userId],
    );
    await client.query(
      `UPDATE public.success_stories SET is_approved = TRUE WHERE user_id = $1`,
      [userId],
    );
    const { rows } = await client.query<UpgradeRequestRow>(
      `UPDATE public.referrer_upgrade_requests SET status = 'approved', admin_notes = $2
        WHERE id = $1 RETURNING *`,
      [requestId, adminNotes],
    );
    if (!rows[0]) throw new Error('Upgrade request not found');
    return rows[0];
  });
}

export async function reject(id: number, adminNotes: string | null): Promise<UpgradeRequestRow | null> {
  const { rows } = await query<UpgradeRequestRow>(
    `UPDATE public.referrer_upgrade_requests SET status = 'rejected', admin_notes = $2
      WHERE id = $1 RETURNING *`,
    [id, adminNotes],
  );
  return rows[0] ?? null;
}

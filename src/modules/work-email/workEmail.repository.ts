import { query, withTransaction } from '../../db/pool';

export interface ChallengeRow {
  id: string;
  user_id: string;
  email: string;
  email_domain: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

export interface VerifiedWorkEmailRow {
  user_id: string;
  email: string;
  email_domain: string;
  verified_at: string;
}

export async function getVerified(userId: string): Promise<VerifiedWorkEmailRow | null> {
  const { rows } = await query<VerifiedWorkEmailRow>(
    `SELECT user_id, email, email_domain, verified_at FROM public.verified_work_emails WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function isEmailTakenByOther(email: string, userId: string): Promise<boolean> {
  const { rows } = await query<{ taken: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM public.verified_work_emails WHERE lower(email) = lower($1) AND user_id <> $2
     ) AS taken`,
    [email, userId],
  );
  return rows[0]?.taken ?? false;
}

export async function countChallengesSince(userId: string, sinceIso: string): Promise<number> {
  const { rows } = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM public.work_email_verifications WHERE user_id = $1 AND created_at > $2`,
    [userId, sinceIso],
  );
  return rows[0]?.count ?? 0;
}

export async function getMostRecent(userId: string): Promise<ChallengeRow | null> {
  const { rows } = await query<ChallengeRow>(
    `SELECT * FROM public.work_email_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function supersedeLive(userId: string, email: string): Promise<void> {
  await query(
    `UPDATE public.work_email_verifications SET consumed_at = NOW()
      WHERE user_id = $1 AND lower(email) = lower($2) AND consumed_at IS NULL`,
    [userId, email],
  );
}

export async function insertChallenge(params: {
  id: string;
  userId: string;
  email: string;
  emailDomain: string;
  codeHash: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `INSERT INTO public.work_email_verifications (id, user_id, email, email_domain, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [params.id, params.userId, params.email, params.emailDomain, params.codeHash, params.expiresAt.toISOString()],
  );
}

export async function getLiveChallenge(userId: string, email: string): Promise<ChallengeRow | null> {
  const { rows } = await query<ChallengeRow>(
    `SELECT * FROM public.work_email_verifications
      WHERE user_id = $1 AND lower(email) = lower($2) AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [userId, email],
  );
  return rows[0] ?? null;
}

export async function incrementAttempt(id: string): Promise<number> {
  const { rows } = await query<{ attempts: number }>(
    `UPDATE public.work_email_verifications SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
    [id],
  );
  return rows[0]?.attempts ?? 0;
}

export async function consume(id: string): Promise<void> {
  await query(`UPDATE public.work_email_verifications SET consumed_at = NOW() WHERE id = $1`, [id]);
}

/** Record the proof and mirror it onto the profile, atomically. */
export async function markVerified(
  challengeId: string,
  userId: string,
  email: string,
  emailDomain: string,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO public.verified_work_emails (user_id, email, email_domain, verification_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         email = EXCLUDED.email, email_domain = EXCLUDED.email_domain,
         verified_at = NOW(), verification_id = EXCLUDED.verification_id`,
      [userId, email, emailDomain, challengeId],
    );
    await client.query(
      `UPDATE public.profiles
          SET office_email = $2, office_email_verified = TRUE, office_email_verified_at = NOW()
        WHERE id = $1`,
      [userId, email],
    );
    await client.query(`UPDATE public.work_email_verifications SET consumed_at = NOW() WHERE id = $1`, [challengeId]);
  });
}

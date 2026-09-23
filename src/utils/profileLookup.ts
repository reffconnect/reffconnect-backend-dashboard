/** Small shared profile lookups used by the request/session modules. */
import { query } from '../db/pool';

export async function getFullName(userId: string): Promise<string> {
  const { rows } = await query<{ full_name: string }>(
    `SELECT full_name FROM public.profiles WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.full_name || 'Unknown User';
}

/** Resolve a referrer's user id by exact name (fallback when the client didn't send an id). */
export async function findReferrerIdByName(name: string): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM public.profiles WHERE full_name = $1 AND role = 'referrer' LIMIT 1`,
    [name],
  );
  return rows[0]?.id ?? null;
}

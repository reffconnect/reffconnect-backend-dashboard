/**
 * Generates a unique human-readable member code (e.g. REEFJS10042, REFFR10001).
 * Replaces the advisory-locked `generate_user_code` RPC with a collision-checked
 * generator against the unique `profiles.user_code` index.
 */
import { query } from '../db/pool';

export async function generateUniqueUserCode(prefix: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = 10_000 + Math.floor(Math.random() * 90_000);
    const code = `${prefix}${suffix}`;
    const { rows } = await query<{ taken: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_code = $1) AS taken`,
      [code],
    );
    if (!rows[0]?.taken) return code;
  }
  // Extremely unlikely fallback: timestamp-based, still prefixed.
  return `${prefix}${Date.now()}`;
}

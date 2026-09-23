import { query } from '../../db/pool';
import { AppError } from '../../utils/AppError';

export interface DropRow {
  id: string;
  company_name: string;
  company_domain: string | null;
  active_referrers_count: number;
  drop_week_start: string;
  drop_week_end: string;
  status: string;
  fee_inr: number;
}

export interface DropCardRow {
  id: string;
  drop_id: string | null;
  student_user_id: string;
  assigned_referrer_id: string | null;
  company_name: string;
  target_job_req_id: string | null;
  target_job_url: string | null;
  resume_url: string | null;
  pitch_text: string | null;
  status: string;
  screening_status: string;
  hr_reference_id: string | null;
  pass_reason: string | null;
  candidate_question: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ScreeningPacket {
  run: Record<string, unknown>;
  checks: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
}

export async function listActiveDrops(companySearch?: string): Promise<DropRow[]> {
  const params: unknown[] = [];
  let where = `status = 'active' AND drop_week_end >= CURRENT_DATE`;
  if (companySearch) {
    params.push(`%${companySearch}%`);
    where += ` AND company_name ILIKE $${params.length}`;
  }
  const { rows } = await query<DropRow>(
    `SELECT id, company_name, company_domain, active_referrers_count, drop_week_start, drop_week_end, status, fee_inr
       FROM public.weekly_referral_drops
      WHERE ${where}
      ORDER BY drop_week_start DESC, company_name ASC`,
    params,
  );
  return rows;
}

export async function insertCard(
  studentUserId: string,
  input: {
    drop_id: string | null;
    company_name: string;
    target_job_req_id?: string | null;
    target_job_url?: string | null;
    resume_url?: string | null;
    pitch_text?: string | null;
    leetcode_url?: string | null;
    github_url?: string | null;
    project_demo_url?: string | null;
    job_description_text?: string | null;
    job_description_source?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<DropCardRow> {
  const { rows } = await query<DropCardRow>(
    `INSERT INTO public.drop_card_entries
       (drop_id, student_user_id, company_name, target_job_req_id, target_job_url, resume_url, pitch_text,
        leetcode_url, github_url, project_demo_url, job_description_text, job_description_source,
        ai_processing_consent_at, status, screening_status, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW(), 'submitted', 'queued', $13::jsonb)
     RETURNING *`,
    [
      input.drop_id,
      studentUserId,
      input.company_name,
      input.target_job_req_id ?? null,
      input.target_job_url ?? null,
      input.resume_url ?? null,
      input.pitch_text ?? null,
      input.leetcode_url ?? null,
      input.github_url ?? null,
      input.project_demo_url ?? null,
      input.job_description_text ?? null,
      input.job_description_source ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  if (!rows[0]) throw AppError.internal('Failed to create drop card');
  return rows[0];
}

export async function getCardById(id: string): Promise<DropCardRow | null> {
  const { rows } = await query<DropCardRow>(`SELECT * FROM public.drop_card_entries WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function listMyCards(studentUserId: string): Promise<DropCardRow[]> {
  const { rows } = await query<DropCardRow>(
    `SELECT * FROM public.drop_card_entries WHERE student_user_id = $1 ORDER BY created_at DESC`,
    [studentUserId],
  );
  return rows;
}

export async function listAssignedCards(referrerId: string): Promise<DropCardRow[]> {
  const { rows } = await query<DropCardRow>(
    `SELECT * FROM public.drop_card_entries
      WHERE assigned_referrer_id = $1 AND screening_status = 'completed'
      ORDER BY created_at DESC`,
    [referrerId],
  );
  return rows;
}

export async function updateCard(id: string, fields: Record<string, unknown>): Promise<DropCardRow | null> {
  const allowed = new Set([
    'assigned_referrer_id',
    'status',
    'screening_status',
    'hr_reference_id',
    'pass_reason',
    'candidate_question',
    'candidate_response',
    'referral_confirmed_at',
  ]);
  const keys = Object.keys(fields).filter((k) => allowed.has(k));
  if (keys.length === 0) return getCardById(id);
  const values: unknown[] = [id];
  const set = keys.map((k) => {
    values.push(fields[k]);
    return `${k} = $${values.length}`;
  });
  const { rows } = await query<DropCardRow>(
    `UPDATE public.drop_card_entries SET ${set.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function findReferrerForCompany(companyName: string): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM public.profiles
      WHERE role = 'referrer' AND is_active = TRUE AND company_name ILIKE $1
      ORDER BY created_at ASC LIMIT 1`,
    [companyName],
  );
  return rows[0]?.id ?? null;
}

// ── Screening runs ────────────────────────────────────────────────────

export async function insertRun(cardId: string, mode: string): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO public.ai_screening_runs (card_id, status, processing_mode) VALUES ($1, 'processing', $2) RETURNING id`,
    [cardId, mode],
  );
  if (!rows[0]) throw AppError.internal('Failed to create screening run');
  return rows[0].id;
}

export async function completeRun(
  runId: string,
  data: {
    recommendation: string;
    confidence: string;
    summary: string;
    why_refer: string[];
    what_to_verify: string[];
    suggested_question: string;
    model_version: string;
    prompt_version: string;
    expiresAt: Date;
  },
): Promise<void> {
  await query(
    `UPDATE public.ai_screening_runs
        SET status = 'completed', recommendation = $2, confidence = $3, summary = $4,
            why_refer = $5::jsonb, what_to_verify = $6::jsonb, suggested_question = $7,
            model_version = $8, prompt_version = $9, completed_at = NOW(), expires_at = $10
      WHERE id = $1`,
    [
      runId,
      data.recommendation,
      data.confidence,
      data.summary,
      JSON.stringify(data.why_refer),
      JSON.stringify(data.what_to_verify),
      data.suggested_question,
      data.model_version,
      data.prompt_version,
      data.expiresAt.toISOString(),
    ],
  );
}

export async function failRun(runId: string): Promise<void> {
  await query(`UPDATE public.ai_screening_runs SET status = 'failed', completed_at = NOW() WHERE id = $1`, [runId]);
}

export async function insertCheck(
  runId: string,
  check: { check_type: string; title: string; status: string; summary: string; sort_order: number },
): Promise<void> {
  await query(
    `INSERT INTO public.ai_screening_checks (run_id, check_type, title, status, summary, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [runId, check.check_type, check.title, check.status, check.summary, check.sort_order],
  );
}

export async function getLatestPacket(cardId: string): Promise<ScreeningPacket | null> {
  const runRes = await query<Record<string, unknown> & { id: string }>(
    `SELECT * FROM public.ai_screening_runs
      WHERE card_id = $1 AND status = 'completed' ORDER BY created_at DESC LIMIT 1`,
    [cardId],
  );
  const run = runRes.rows[0];
  if (!run) return null;
  const [checks, evidence] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT * FROM public.ai_screening_checks WHERE run_id = $1 ORDER BY sort_order ASC`,
      [run.id],
    ),
    query<Record<string, unknown>>(`SELECT * FROM public.ai_screening_evidence WHERE run_id = $1`, [run.id]),
  ]);
  return { run, checks: checks.rows, evidence: evidence.rows };
}

// ── Preferences ───────────────────────────────────────────────────────

export interface DropPreferencesRow {
  user_id: string;
  companies: string[] | null;
  roles: string[] | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  updated_at: string;
}

export async function getPreferences(userId: string): Promise<DropPreferencesRow | null> {
  const { rows } = await query<DropPreferencesRow>(
    `SELECT * FROM public.referrer_drop_preferences WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function upsertPreferences(
  userId: string,
  prefs: { companies?: string[]; roles?: string[]; is_active?: boolean; metadata?: Record<string, unknown> },
): Promise<DropPreferencesRow> {
  const { rows } = await query<DropPreferencesRow>(
    `INSERT INTO public.referrer_drop_preferences (user_id, companies, roles, is_active, metadata)
     VALUES ($1, $2, $3, COALESCE($4, TRUE), $5::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET
       companies = COALESCE(EXCLUDED.companies, public.referrer_drop_preferences.companies),
       roles = COALESCE(EXCLUDED.roles, public.referrer_drop_preferences.roles),
       is_active = EXCLUDED.is_active,
       metadata = EXCLUDED.metadata
     RETURNING *`,
    [userId, prefs.companies ?? null, prefs.roles ?? null, prefs.is_active ?? null, JSON.stringify(prefs.metadata ?? {})],
  );
  if (!rows[0]) throw AppError.internal('Failed to save preferences');
  return rows[0];
}

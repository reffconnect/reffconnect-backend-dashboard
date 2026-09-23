import { query } from '../../db/pool';

export interface CategoryRecord {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  job_count?: number;
}

/** Active categories with a count of their ACTIVE job postings (matches api.getCategories). */
export async function listActiveCategoriesWithCounts(): Promise<CategoryRecord[]> {
  const { rows } = await query<CategoryRecord & { job_count: string }>(
    `SELECT c.id, c.name, c.description, c.icon, c.is_active, c.created_at, c.updated_at,
            COUNT(j.id) FILTER (WHERE j.status = 'active') AS job_count
       FROM public.categories c
       LEFT JOIN public.jobs j ON j.category_id = c.id
      WHERE c.is_active = TRUE
      GROUP BY c.id
      ORDER BY c.name ASC`,
  );
  return rows.map((row) => ({ ...row, job_count: Number(row.job_count) }));
}

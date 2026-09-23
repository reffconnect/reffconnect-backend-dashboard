import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { query } from '../../db/pool';

const listQuerySchema = z.object({
  company: z.string().trim().max(200).optional(),
});

export const externalJobsRouter = Router();

// Active openings ingested from company career pages. Ingestion itself is a
// Phase-H worker (ingest-company-jobs); this is the read side.
externalJobsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { company } = listQuerySchema.parse(req.query);
    const params: unknown[] = [];
    let where = 'is_active = TRUE';
    if (company) {
      params.push(`%${company}%`);
      where += ` AND company_name ILIKE $${params.length}`;
    }
    const { rows } = await query(
      `SELECT * FROM public.external_jobs WHERE ${where}
        ORDER BY posted_at DESC NULLS LAST LIMIT 500`,
      params,
    );
    sendSuccess(res, rows);
  }),
);

import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { authenticate, requireRole } from '../../middleware/auth';
import { query } from '../../db/pool';

export const metricsRouter = Router();

// Investor/admin metrics. Admin-only.
metricsRouter.use(authenticate, requireRole('admin'));

metricsRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const { rows } = await query<Record<string, number>>(
      `SELECT
         (SELECT COALESCE(SUM(amount_paise), 0) FROM public.payment_orders WHERE status = 'paid')        AS gmv_paise,
         (SELECT COALESCE(SUM(platform_fee_paise), 0) FROM public.payment_orders WHERE status = 'paid')  AS platform_revenue_paise,
         (SELECT COUNT(*) FROM public.payment_orders WHERE status = 'paid')                              AS paid_orders,
         (SELECT COUNT(*) FROM public.profiles WHERE role = 'referrer' AND is_active = TRUE)             AS active_referrers,
         (SELECT COUNT(*) FROM public.profiles)                                                          AS total_users,
         (
           (SELECT COUNT(*) FROM public.referral_sessions WHERE status = 'completed')
           + (SELECT COUNT(*) FROM public.mock_interview_sessions WHERE status = 'completed')
         )                                                                                               AS completed_sessions`,
    );
    const r = rows[0];
    const gmv = Number(r?.gmv_paise ?? 0);
    const revenue = Number(r?.platform_revenue_paise ?? 0);
    sendSuccess(res, {
      gmv_inr: gmv / 100,
      platform_revenue_inr: revenue / 100,
      take_rate: gmv > 0 ? Number((revenue / gmv).toFixed(4)) : 0,
      paid_orders: Number(r?.paid_orders ?? 0),
      active_referrers: Number(r?.active_referrers ?? 0),
      total_users: Number(r?.total_users ?? 0),
      completed_sessions: Number(r?.completed_sessions ?? 0),
    });
  }),
);

metricsRouter.get(
  '/cohorts',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT date_trunc('week', created_at)::date AS cohort_week, COUNT(*)::int AS signups
         FROM public.profiles GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
    );
    sendSuccess(res, rows);
  }),
);

metricsRouter.get(
  '/acquisition',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT COALESCE(NULLIF(utm_source, ''), 'direct') AS channel, COUNT(*)::int AS users
         FROM public.profiles GROUP BY 1 ORDER BY users DESC`,
    );
    sendSuccess(res, rows);
  }),
);

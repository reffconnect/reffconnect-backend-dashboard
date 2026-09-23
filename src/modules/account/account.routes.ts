import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { authenticate } from '../../middleware/auth';
import * as repo from './account.repository';

export const accountRouter = Router();

accountRouter.use(authenticate);

// Data portability (DPDP): export everything we hold about the caller.
accountRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    sendSuccess(res, await repo.exportData(req.user.id));
  }),
);

// Self-service account deletion. Irreversible; cascades to all owned rows.
accountRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    await repo.deleteUser(req.user.id);
    sendSuccess(res, { deleted: true }, 200, 'Account deleted');
  }),
);

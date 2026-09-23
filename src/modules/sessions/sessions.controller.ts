import type { RequestHandler } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import {
  cancelSessionSchema,
  idParamSchema,
  referrerIdParamSchema,
  rescheduleSessionSchema,
  scheduleSessionSchema,
} from './sessions.schema';
import * as service from './sessions.service';
import type { SessionKind } from './sessions.repository';

export interface SessionController {
  schedule: RequestHandler;
  listMine: RequestHandler;
  getById: RequestHandler;
  reschedule: RequestHandler;
  cancel: RequestHandler;
  busySlots: RequestHandler;
}

/** Builds a set of handlers bound to a specific session kind. */
export function createSessionController(kind: SessionKind): SessionController {
  return {
    schedule: asyncHandler(async (req, res) => {
      if (!req.user) throw AppError.unauthorized();
      const input = scheduleSessionSchema.parse(req.body);
      sendCreated(res, await service.schedule(kind, req.user.id, input), 'Session scheduled');
    }),
    listMine: asyncHandler(async (req, res) => {
      if (!req.user) throw AppError.unauthorized();
      sendSuccess(res, await service.listMine(kind, req.user.id));
    }),
    getById: asyncHandler(async (req, res) => {
      if (!req.user) throw AppError.unauthorized();
      const { id } = idParamSchema.parse(req.params);
      sendSuccess(res, await service.getById(kind, id, req.user.id));
    }),
    reschedule: asyncHandler(async (req, res) => {
      if (!req.user) throw AppError.unauthorized();
      const { id } = idParamSchema.parse(req.params);
      const input = rescheduleSessionSchema.parse(req.body);
      sendSuccess(res, await service.reschedule(kind, id, req.user.id, input), 200, 'Session rescheduled');
    }),
    cancel: asyncHandler(async (req, res) => {
      if (!req.user) throw AppError.unauthorized();
      const { id } = idParamSchema.parse(req.params);
      const { reason } = cancelSessionSchema.parse(req.body);
      sendSuccess(res, await service.cancel(kind, id, req.user.id, reason ?? null), 200, 'Session cancelled');
    }),
    busySlots: asyncHandler(async (req, res) => {
      const { referrerId } = referrerIdParamSchema.parse(req.params);
      sendSuccess(res, await service.busySlots(kind, referrerId));
    }),
  };
}

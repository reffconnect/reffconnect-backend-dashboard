import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import {
  acceptCardSchema,
  askCandidateSchema,
  cardIdParamSchema,
  listDropsQuerySchema,
  passCardSchema,
  savePreferencesSchema,
  submitCardSchema,
} from './drops.schema';
import * as service from './drops.service';

export const listActive = asyncHandler(async (req, res) => {
  const { company } = listDropsQuerySchema.parse(req.query);
  sendSuccess(res, await service.getActiveDrops(company));
});

export const submitCard = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = submitCardSchema.parse(req.body);
  sendCreated(res, await service.submitCard(req.user.id, input), 'Card submitted for screening');
});

export const myCards = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  sendSuccess(res, await service.getMyCards(req.user.id));
});

export const confirmReceipt = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = cardIdParamSchema.parse(req.params);
  sendSuccess(res, await service.confirmReceipt(id, req.user.id), 200, 'Referral receipt confirmed');
});

export const assignedCards = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  sendSuccess(res, await service.getAssignedCards(req.user.id));
});

export const acceptCard = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = cardIdParamSchema.parse(req.params);
  const { hr_reference_id } = acceptCardSchema.parse(req.body);
  sendSuccess(res, await service.acceptCard(id, req.user.id, hr_reference_id), 200, 'Card accepted');
});

export const askCandidate = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = cardIdParamSchema.parse(req.params);
  const { question } = askCandidateSchema.parse(req.body);
  sendSuccess(res, await service.askCandidate(id, req.user.id, question), 200, 'Question sent');
});

export const passCard = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = cardIdParamSchema.parse(req.params);
  const { reason } = passCardSchema.parse(req.body);
  sendSuccess(res, await service.passCard(id, req.user.id, reason), 200, 'Card passed');
});

export const getPreferences = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  sendSuccess(res, await service.getPreferences(req.user.id));
});

export const savePreferences = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const prefs = savePreferencesSchema.parse(req.body);
  sendSuccess(res, await service.savePreferences(req.user.id, prefs), 200, 'Preferences saved');
});

import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import {
  addNoteSchema,
  listNotesQuerySchema,
  noteIdParamSchema,
  toggleActionItemSchema,
} from './notes.schema';
import * as service from './notes.service';

export const list = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { service: svc, request_id } = listNotesQuerySchema.parse(req.query);
  sendSuccess(res, await service.listNotes(svc, request_id, req.user.id));
});

export const add = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { service: svc, request_id, body, is_action_item } = addNoteSchema.parse(req.body);
  sendCreated(res, await service.addNote(svc, request_id, req.user.id, body, is_action_item));
});

export const toggleActionItem = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = noteIdParamSchema.parse(req.params);
  const { is_done } = toggleActionItemSchema.parse(req.body);
  sendSuccess(res, await service.toggleActionItem(id, req.user.id, is_done));
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { id } = noteIdParamSchema.parse(req.params);
  await service.deleteNote(id, req.user.id);
  sendSuccess(res, { deleted: true });
});

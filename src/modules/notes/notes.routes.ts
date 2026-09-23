import { Router } from 'express';
import * as controller from './notes.controller';
import { authenticate } from '../../middleware/auth';

export const notesRouter = Router();

notesRouter.use(authenticate);
notesRouter.get('/', controller.list);
notesRouter.post('/', controller.add);
notesRouter.patch('/:id/action-item', controller.toggleActionItem);
notesRouter.delete('/:id', controller.remove);

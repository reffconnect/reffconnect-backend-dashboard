import { Router } from 'express';
import * as controller from './successStories.controller';
import { authenticate } from '../../middleware/auth';

export const successStoriesRouter = Router();

successStoriesRouter.get('/', controller.listApproved);
successStoriesRouter.get('/referrer/:id', controller.listForReferrer);
successStoriesRouter.post('/', authenticate, controller.create);

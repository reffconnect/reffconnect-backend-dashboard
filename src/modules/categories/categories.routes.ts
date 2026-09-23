import { Router } from 'express';
import * as controller from './categories.controller';

export const categoriesRouter = Router();

// Public reference data.
categoriesRouter.get('/', controller.listCategories);

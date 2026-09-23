import type { RequestHandler } from 'express';
import { sendError } from '../utils/apiResponse';

/** Terminal handler for unmatched routes. Mounted after all real routes. */
export const notFound: RequestHandler = (req, res) => {
  sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
};

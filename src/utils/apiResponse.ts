/**
 * Response envelope helpers.
 *
 * The shape mirrors the frontend's `ApiResponse<T>` in
 * `my-app/src/shared/services/api.ts`:
 *   { success: boolean; data?: T; message?: string; error?: string; status: number }
 * Keeping it identical is what makes a future frontend switch low-friction.
 */
import type { Response } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  status: number;
}

export function sendSuccess<T>(res: Response, data: T, status = 200, message?: string): Response {
  const body: ApiResponse<T> = { success: true, data, status };
  if (message !== undefined) body.message = message;
  return res.status(status).json(body);
}

export function sendCreated<T>(res: Response, data: T, message?: string): Response {
  return sendSuccess(res, data, 201, message);
}

export function sendError(res: Response, error: string, status = 500, details?: unknown): Response {
  const body: ApiResponse<never> & { details?: unknown } = { success: false, error, status };
  if (details !== undefined) body.details = details;
  return res.status(status).json(body);
}

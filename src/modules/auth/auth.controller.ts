import type { Request } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { loginSchema, refreshSchema, registerSchema } from './auth.schema';
import * as authService from './auth.service';
import * as repo from './auth.repository';

function getUserAgent(req: Request): string | undefined {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

export const register = asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input, getUserAgent(req));
  sendCreated(res, result, 'Registration successful');
});

export const login = asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input, getUserAgent(req));
  sendSuccess(res, result);
});

export const refresh = asyncHandler(async (req, res) => {
  const { refresh_token } = refreshSchema.parse(req.body);
  const tokens = await authService.refresh(refresh_token, getUserAgent(req));
  sendSuccess(res, tokens);
});

export const logout = asyncHandler(async (req, res) => {
  const { refresh_token } = refreshSchema.parse(req.body);
  await authService.logout(refresh_token);
  sendSuccess(res, { message: 'Logged out' });
});

export const me = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const profile = await repo.getProfileSummary(req.user.id);
  if (!profile) throw AppError.notFound('Profile not found');
  sendSuccess(res, profile);
});

// ── OAuth ────────────────────────────────────────────────────────────
import { z } from 'zod';
import { verifyGoogleIdToken, exchangeLinkedInCode } from '../../integrations/oauth';

const googleOAuthSchema = z.object({ id_token: z.string().min(1) });
const linkedinOAuthSchema = z.object({ code: z.string().min(1), redirect_uri: z.string().url() });

export const googleOAuth = asyncHandler(async (req, res) => {
  const { id_token } = googleOAuthSchema.parse(req.body);
  const identity = await verifyGoogleIdToken(id_token);
  const result = await authService.loginWithOAuth(identity, 'google', getUserAgent(req));
  sendSuccess(res, result);
});

export const linkedinOAuth = asyncHandler(async (req, res) => {
  const { code, redirect_uri } = linkedinOAuthSchema.parse(req.body);
  const identity = await exchangeLinkedInCode(code, redirect_uri);
  const result = await authService.loginWithOAuth(identity, 'linkedin', getUserAgent(req));
  sendSuccess(res, result);
});

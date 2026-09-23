import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import * as storage from '../../integrations/storage';
import { canAccessRequest } from '../notes/notes.repository';
import { getResumePath } from './storage.repository';
import { downloadParamSchema, resumeUrlQuerySchema, uploadBodySchema } from './storage.schema';

export const upload = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { purpose } = uploadBodySchema.parse(req.body ?? {});
  const file = (req as { file?: { originalname?: string; buffer?: Buffer } }).file;
  if (!file || !file.buffer) throw AppError.badRequest('No file uploaded (field name must be "file")');

  const { path } = await storage.putObject({
    userId: req.user.id,
    purpose: purpose ?? 'misc',
    filename: file.originalname ?? 'file',
    buffer: file.buffer,
  });
  sendSuccess(res, { path, download_url: storage.downloadUrlFor(path) }, 201, 'File uploaded');
});

export const download = asyncHandler(async (req, res) => {
  const { token } = downloadParamSchema.parse(req.params);
  const path = storage.verifyDownloadToken(token);
  const { buffer, contentType } = await storage.readObject(path);
  const filename = path.split('/').pop() ?? 'download';
  // Force download (never render user-uploaded content inline) + no MIME sniffing:
  // prevents stored-XSS via same-origin HTML/SVG.
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
  res.status(200).send(buffer);
});

/** Issue a short-lived download URL for a request's resume, to a participant only. */
export const resumeUrl = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { service, request_id } = resumeUrlQuerySchema.parse(req.query);
  if (!(await canAccessRequest(service, request_id, req.user.id))) {
    throw AppError.forbidden('You do not have access to this resume');
  }
  const path = await getResumePath(service, request_id);
  if (!path) throw AppError.notFound('No resume is attached to this request');
  sendSuccess(res, { download_url: storage.downloadUrlFor(path) });
});

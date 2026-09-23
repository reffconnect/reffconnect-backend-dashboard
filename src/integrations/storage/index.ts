/**
 * Object storage facade.
 *
 * Selects a backend from STORAGE_PROVIDER (local disk by default; S3 in
 * production) and exposes a provider-agnostic surface. Access control is
 * uniform across providers: objects are private and downloads are authorized by
 * a short-lived signed JWT, streamed back through our API (see storage
 * controller) rather than via public/presigned URLs.
 *
 * The S3 provider — and the AWS SDK it pulls in — is imported lazily, so local
 * deployments never load it.
 */
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { config } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { localProvider } from './local';
import { contentTypeFor, type PutObjectParams, type StorageProvider } from './provider';

export { contentTypeFor };
export type { PutObjectParams, StorageProvider };

let s3ProviderPromise: Promise<StorageProvider> | null = null;

/** Resolve the active provider; loads the S3 module only when selected. */
async function provider(): Promise<StorageProvider> {
  if (config.STORAGE_PROVIDER !== 's3') return localProvider;
  if (!s3ProviderPromise) {
    s3ProviderPromise = import('./s3').then((m) => m.s3Provider);
  }
  return s3ProviderPromise;
}

export async function putObject(params: PutObjectParams): Promise<{ path: string }> {
  return (await provider()).putObject(params);
}

export async function readObject(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  return (await provider()).readObject(key);
}

/** Issue a short-lived signed token that authorizes downloading exactly one object. */
export function signDownloadToken(path: string): string {
  return jwt.sign({ path, type: 'download' }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.STORAGE_DOWNLOAD_TTL,
    algorithm: 'HS256',
  });
}

export function verifyDownloadToken(token: string): string {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as JwtPayload & { path?: string; type?: string };
    if (decoded.type !== 'download' || typeof decoded.path !== 'string') {
      throw AppError.unauthorized('Invalid download token');
    }
    return decoded.path;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Download link is invalid or expired');
  }
}

/** Relative API URL a client can GET to fetch the object. */
export function downloadUrlFor(path: string): string {
  return `/api/v1/storage/download/${signDownloadToken(path)}`;
}

export const maxUploadBytes = config.STORAGE_MAX_UPLOAD_MB * 1024 * 1024;

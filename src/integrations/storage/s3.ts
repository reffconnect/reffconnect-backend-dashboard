/**
 * S3 storage provider (STORAGE_PROVIDER=s3). Also works with S3-compatible
 * stores (e.g. MinIO) via STORAGE_S3_ENDPOINT + STORAGE_S3_FORCE_PATH_STYLE.
 *
 * Fail closed: the bucket is required (validated at boot in config/env.ts), and
 * credentials come from the standard AWS provider chain. If credentials can't
 * be resolved or the call is denied, the SDK throws and we surface an error —
 * there is no silent fallback to local disk.
 *
 * Objects are private. Downloads still flow through our API behind a short-lived
 * signed token (see ./index.ts), so we never hand out public or presigned S3
 * URLs and the access-control model matches the local provider exactly.
 */
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { config } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import {
  buildObjectKey,
  contentTypeFor,
  type PutObjectParams,
  type StorageProvider,
} from './provider';

let client: S3Client | null = null;

/** Lazily construct a single S3 client from config. */
function getClient(): S3Client {
  if (client) return client;
  const options: S3ClientConfig = {
    forcePathStyle: config.STORAGE_S3_FORCE_PATH_STYLE,
  };
  if (config.STORAGE_S3_REGION) options.region = config.STORAGE_S3_REGION;
  if (config.STORAGE_S3_ENDPOINT) options.endpoint = config.STORAGE_S3_ENDPOINT;
  client = new S3Client(options);
  return client;
}

function bucket(): string {
  const b = config.STORAGE_S3_BUCKET;
  // Defensive: env validation already guarantees this in s3 mode.
  if (!b) throw AppError.internal('S3 storage is not configured (missing bucket)');
  return b;
}

/** Prepend the optional key prefix (no leading/trailing slash surprises). */
function objectKeyFor(key: string): string {
  const prefix = config.STORAGE_S3_PREFIX.replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${key}` : key;
}

export const s3Provider: StorageProvider = {
  async putObject(params: PutObjectParams): Promise<{ path: string }> {
    const key = buildObjectKey(params);
    try {
      await getClient().send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: objectKeyFor(key),
          Body: params.buffer,
          ContentType: contentTypeFor(key),
          // Belt-and-suspenders: keep uploaded objects private even if a bucket
          // policy would otherwise widen access.
          ACL: 'private',
        }),
      );
    } catch (err) {
      logger.error('S3 putObject failed', err instanceof Error ? err.message : err);
      throw AppError.internal('Failed to store file');
    }
    // Persist the logical key (without prefix) so provider/prefix changes stay
    // transparent to the rest of the app.
    return { path: key };
  },

  async readObject(key: string): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      const out = await getClient().send(
        new GetObjectCommand({ Bucket: bucket(), Key: objectKeyFor(key) }),
      );
      if (!out.Body) throw AppError.notFound('File not found');
      // SDK v3 (Node): Body is a stream with helper transforms.
      const bytes = await out.Body.transformToByteArray();
      return { buffer: Buffer.from(bytes), contentType: contentTypeFor(key) };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const name = err instanceof Error ? err.name : '';
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw AppError.notFound('File not found');
      }
      logger.error('S3 readObject failed', err instanceof Error ? err.message : err);
      throw AppError.internal('Failed to read file');
    }
  },
};

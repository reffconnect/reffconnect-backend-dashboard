import { afterAll, describe, it, expect } from 'vitest';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  contentTypeFor,
  downloadUrlFor,
  putObject,
  readObject,
  signDownloadToken,
  verifyDownloadToken,
} from '../src/integrations/storage';
import { signAccessToken } from '../src/utils/jwt';

afterAll(async () => {
  // Clean the throwaway storage dir created by putObject.
  await rm(resolve(process.cwd(), 'var/test-storage'), { recursive: true, force: true }).catch(() => undefined);
});

describe('download tokens', () => {
  it('roundtrips the path', () => {
    const path = 'user-1/resume/abc-file.pdf';
    const token = signDownloadToken(path);
    expect(verifyDownloadToken(token)).toBe(path);
  });

  it('rejects an access token as a download token (type isolation)', () => {
    const { token } = signAccessToken({ sub: 'u1', email: 'a@b.com', role: 'job_seeker' });
    expect(() => verifyDownloadToken(token)).toThrow();
  });

  it('embeds a signed token in the download URL', () => {
    const url = downloadUrlFor('user-1/x.pdf');
    expect(url.startsWith('/api/v1/storage/download/')).toBe(true);
  });
});

describe('content type', () => {
  it('maps known extensions and defaults unknown to octet-stream', () => {
    expect(contentTypeFor('a.pdf')).toBe('application/pdf');
    expect(contentTypeFor('a.png')).toBe('image/png');
    expect(contentTypeFor('a.html')).toBe('application/octet-stream');
    expect(contentTypeFor('a.exe')).toBe('application/octet-stream');
  });
});

describe('object storage (local)', () => {
  it('stores and reads back a file', async () => {
    const { path } = await putObject({
      userId: 'u1',
      purpose: 'test',
      filename: 'note.txt',
      buffer: Buffer.from('hello world'),
    });
    const { buffer, contentType } = await readObject(path);
    expect(buffer.toString()).toBe('hello world');
    expect(contentType).toBe('text/plain');
  });

  it('refuses path traversal outside the storage root', async () => {
    await expect(readObject('../../../etc/passwd')).rejects.toThrow();
  });
});

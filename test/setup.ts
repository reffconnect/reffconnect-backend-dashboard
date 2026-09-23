/**
 * Global test setup — runs in each worker BEFORE any test file (and therefore
 * before `src/config/env` is imported and frozen).
 *
 * vitest's `env` config only *adds* variables to process.env; it does not strip
 * ones inherited from the developer's shell or a loaded `.env`. Under test we
 * skip dotenv (see config/env.ts), but shell-level exports can still leak in.
 * We delete every OPTIONAL integration/scaling variable here so the suite is
 * hermetic and deterministic regardless of the machine it runs on:
 *   - no REDIS_URL  → in-memory rate limiting, cache no-ops, no socket to Redis
 *   - no provider keys → integrations report disabled, so the e2e "fail closed
 *     with 503" assertions hold whether or not the dev has real keys exported.
 *
 * We intentionally do NOT touch the required vars (DATABASE_URL, JWT secrets)
 * or NODE_ENV — those are provided by vitest.config and validated by env.ts.
 */
const STRIP: readonly string[] = [
  // Cache / scaling
  'REDIS_URL',
  'DATABASE_REPLICA_URL',
  // Payments (Razorpay)
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  // Video (Daily)
  'DAILY_API_KEY',
  // Email (Resend)
  'RESEND_API_KEY',
  'SENDER_EMAIL',
  // AI (OpenAI)
  'OPENAI_API_KEY',
  // OAuth
  'GOOGLE_CLIENT_ID',
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  // Work-email OTP pepper
  'WORK_EMAIL_OTP_PEPPER',
  // Object storage: force the default local provider so storage tests never
  // reach a real S3 bucket if these leak in from the shell/.env.
  'STORAGE_PROVIDER',
  'STORAGE_S3_BUCKET',
  'STORAGE_S3_REGION',
  'STORAGE_S3_PREFIX',
  'STORAGE_S3_ENDPOINT',
  'STORAGE_S3_FORCE_PATH_STYLE',
];

for (const key of STRIP) {
  delete process.env[key];
}

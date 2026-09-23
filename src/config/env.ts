/**
 * Environment configuration.
 *
 * Loads `.env`, validates every variable with zod, and exposes a single frozen
 * `config` object. The process exits early with a readable message if anything
 * required is missing or malformed — we never boot in a half-configured state.
 */
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env for normal runs. Under test, the runner provides a hermetic env
// (vitest config), so we skip .env to keep tests deterministic.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

/** Coerce common truthy/falsy strings into real booleans (z.coerce.boolean treats "false" as true). */
const zBool = (def: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(def)
    .transform((v) => (typeof v === 'boolean' ? v : v.trim().toLowerCase() === 'true'));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8000),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_SSL: zBool(false),

    JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
    JWT_ACCESS_TTL: z.string().default('1h'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

    // ── Login lockout (per-account, complements the IP-based auth limiter) ──
    // After LOGIN_MAX_FAILS consecutive failures for one email within the
    // window, that account is temporarily locked. Requires Redis; fails open
    // (no lockout) when Redis is unavailable. The window doubles as the lock
    // duration and auto-expires, bounding lockout-DoS risk from a spoofed email.
    LOGIN_MAX_FAILS: z.coerce.number().int().positive().default(10),
    LOGIN_FAIL_WINDOW_MS: z.coerce.number().int().positive().default(900_000),

    // ── Cache / Redis (optional) ──────────────────────────────────────
    // When set, enables a shared cache and multi-instance-safe rate limiting.
    // When absent, the API degrades gracefully to in-memory rate limiting
    // (single instance only) and skips caching.
    REDIS_URL: z.string().min(1).optional(),

    // ── Database pool / scaling ───────────────────────────────────────
    // Per-instance pool size. Budget this against your connection ceiling:
    // behind PgBouncer (transaction pooling) this can be generous; without it,
    // keep instances * DB_POOL_MAX below Postgres max_connections.
    DB_POOL_MAX: z.coerce.number().int().positive().max(1000).default(10),
    DB_POOL_MIN: z.coerce.number().int().min(0).default(0),
    // Optional read replica. Reads that tolerate replication lag can be routed
    // here via queryReplica(); falls back to the primary when unset.
    DATABASE_REPLICA_URL: z.string().min(1).optional(),
    // Per-statement timeout (ms). 0 disables. Guards against runaway queries
    // holding connections and starving the pool. Applied to both pools.
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).default(15_000),

    // ── External integrations (all optional; features fail closed when unset) ──
    // Payments (Razorpay). The secret signs/verifies; the webhook secret is separate.
    RAZORPAY_KEY_ID: z.string().min(1).optional(),
    RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
    // Platform take rate in basis points (1500 = 15%). Used to split paid orders.
    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(1500),
    // Video (Daily.co).
    DAILY_API_KEY: z.string().min(1).optional(),
    // Email (Resend).
    RESEND_API_KEY: z.string().min(1).optional(),
    SENDER_EMAIL: z.string().email().optional(),
    WEBSITE_URL: z.string().url().default('http://localhost:3000'),
    // AI (OpenAI) for resume parsing + referral-card screening.
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().default('gpt-4o-mini'),
    // OAuth. Google needs only the client id (id_token audience check); LinkedIn
    // OIDC needs client id + secret for the code exchange.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
    LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),
    // Work-email OTP hashing pepper (falls back to the refresh secret when unset).
    WORK_EMAIL_OTP_PEPPER: z.string().min(1).optional(),

    // ── Object storage ────────────────────────────────────────────────
    // Local disk provider by default (works with zero credentials). Swap in an
    // S3-backed provider in production by setting STORAGE_PROVIDER=s3 and adding
    // an s3 adapter. Downloads are gated by short-lived signed tokens.
    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    STORAGE_DIR: z.string().default('var/storage'),
    STORAGE_DOWNLOAD_TTL: z.coerce.number().int().positive().default(300),
    STORAGE_MAX_UPLOAD_MB: z.coerce.number().int().positive().max(50).default(10),
    // S3 provider settings (used only when STORAGE_PROVIDER=s3). The bucket is
    // required in that mode (enforced below). Region falls back to the SDK's
    // AWS_REGION resolution. Endpoint + path-style support S3-compatible stores
    // (e.g. MinIO). Credentials come from the standard AWS provider chain
    // (env vars, shared config, or an instance/task role) — never from here.
    STORAGE_S3_BUCKET: z.string().min(1).optional(),
    STORAGE_S3_REGION: z.string().min(1).optional(),
    STORAGE_S3_PREFIX: z.string().default(''),
    STORAGE_S3_ENDPOINT: z.string().url().optional(),
    STORAGE_S3_FORCE_PATH_STYLE: zBool(false),
  })
  .superRefine((val, ctx) => {
    if (val.DB_POOL_MIN > val.DB_POOL_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DB_POOL_MIN'],
        message: 'DB_POOL_MIN cannot exceed DB_POOL_MAX',
      });
    }
    // Fail closed: selecting the S3 provider without a bucket is a misconfig.
    // (Missing credentials still fail closed at call time via the AWS SDK.)
    if (val.STORAGE_PROVIDER === 's3' && !val.STORAGE_S3_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STORAGE_S3_BUCKET'],
        message: 'STORAGE_S3_BUCKET is required when STORAGE_PROVIDER=s3',
      });
    }
    // Never let placeholder secrets reach production.
    if (val.NODE_ENV === 'production') {
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (val[key].includes('change-me')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} still holds the placeholder value; set a real secret in production`,
          });
        }
      }
      if (val.JWT_ACCESS_SECRET === val.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n[config] Invalid environment configuration:\n${details}\n`);
  process.exit(1);
}

export type AppConfig = z.infer<typeof envSchema> & {
  corsOrigins: string[];
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  redisEnabled: boolean;
  hasReadReplica: boolean;
  paymentsEnabled: boolean;
  videoEnabled: boolean;
  emailEnabled: boolean;
  aiEnabled: boolean;
  googleOAuthEnabled: boolean;
  linkedinOAuthEnabled: boolean;
};

export const config: Readonly<AppConfig> = Object.freeze({
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
  isDevelopment: parsed.data.NODE_ENV === 'development',
  isTest: parsed.data.NODE_ENV === 'test',
  redisEnabled: Boolean(parsed.data.REDIS_URL),
  hasReadReplica: Boolean(parsed.data.DATABASE_REPLICA_URL),
  paymentsEnabled: Boolean(parsed.data.RAZORPAY_KEY_ID && parsed.data.RAZORPAY_KEY_SECRET),
  videoEnabled: Boolean(parsed.data.DAILY_API_KEY),
  emailEnabled: Boolean(parsed.data.RESEND_API_KEY && parsed.data.SENDER_EMAIL),
  aiEnabled: Boolean(parsed.data.OPENAI_API_KEY),
  googleOAuthEnabled: Boolean(parsed.data.GOOGLE_CLIENT_ID),
  linkedinOAuthEnabled: Boolean(parsed.data.LINKEDIN_CLIENT_ID && parsed.data.LINKEDIN_CLIENT_SECRET),
});

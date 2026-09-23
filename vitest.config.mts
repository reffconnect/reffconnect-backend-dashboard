import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Strip inherited/optional env vars before any module loads (see setup.ts).
    setupFiles: ['test/setup.ts'],
    // Hermetic env: tests never read the real .env (see config/env.ts). No
    // REDIS_URL → in-memory rate limiting + revocation is a no-op. DATABASE_URL
    // is a placeholder; the covered routes never touch the database.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/connectx_test',
      JWT_ACCESS_SECRET: 'test-access-secret-abcdefghijklmnop',
      JWT_REFRESH_SECRET: 'test-refresh-secret-zyxwvutsrqponmlkj',
      STORAGE_DIR: 'var/test-storage',
    },
    pool: 'forks',
    // Don't hang the run on a lingering pool/socket handle.
    teardownTimeout: 5000,
  },
});

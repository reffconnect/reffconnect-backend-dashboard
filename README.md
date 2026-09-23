# ConnectX Backend

A standalone **Node.js + TypeScript + Express** API server for ConnectX.

> **Why this exists.** The current app (`my-app/`) talks directly to Supabase
> (Postgres + Auth + Storage + Edge Functions). This backend is a parallel,
> **fully isolated** service intended to become the primary backend as the
> product scales. It lives in its own folder, uses its **own** database, and
> **does not touch** `my-app/` or the Supabase project. Nothing in the existing
> app imports from here yet — the switch is deliberate and happens later.

The public response envelope and the Profile/Job/Category shapes mirror
`my-app/src/shared/services/api.ts`, so migrating the frontend to this backend
is a low-friction change when the time comes.

---

## Tech stack

| Concern         | Choice                                              |
| --------------- | --------------------------------------------------- |
| Runtime         | Node.js (>= 18.18)                                   |
| Language        | TypeScript (strict)                                 |
| HTTP framework  | Express 4                                           |
| Database        | PostgreSQL via `pg` (primary + optional read replica) |
| Cache / limits  | Redis (optional) via `ioredis` + `rate-limit-redis` |
| Auth            | JWT access + refresh (rotating), bcrypt             |
| Validation      | zod                                                 |
| Security        | helmet, CORS allow-list, rate limiting              |
| Logging         | morgan (HTTP) + a tiny leveled logger               |

## Project layout

```
backend/
├── db/
│   └── schema.sql              # self-contained schema + seed (own database)
├── src/
│   ├── config/env.ts           # zod-validated environment config
│   ├── db/
│   │   ├── pool.ts             # pg pool + query/transaction helpers
│   │   └── migrate.ts          # applies db/schema.sql  (npm run db:migrate)
│   ├── middleware/             # auth, error handler, notFound, rate limit
│   ├── modules/                # feature modules (routes→controller→service→repository)
│   │   ├── auth/
│   │   ├── profiles/
│   │   ├── categories/
│   │   ├── jobs/
│   │   └── health/
│   ├── types/                  # shared enums + Express Request augmentation
│   ├── utils/                  # AppError, apiResponse, asyncHandler, jwt, logger
│   ├── routes.ts               # aggregates modules under /api/v1
│   ├── app.ts                  # Express app factory (middleware + routes)
│   └── index.ts                # entrypoint (bootstrap + graceful shutdown)
├── Dockerfile
├── package.json
└── tsconfig.json
```

Each module follows a layered pattern:

```
routes  →  controller  →  service  →  repository  →  Postgres
(HTTP)     (validate,      (business    (SQL only)
            envelope)       rules,
                            authz)
```

## Getting started

Prerequisites: Node.js 18.18+ and a PostgreSQL instance you control (local
Docker, a separate managed DB, etc.). **Do not** point this at the app's live
Supabase database — the whole point is isolation.

```bash
cd backend
npm install
cp .env.example .env          # then edit .env (PowerShell: Copy-Item .env.example .env)
```

Set at minimum in `.env`:

- `DATABASE_URL` — your Postgres connection string
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — long random strings
  (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)

Spin up a local Postgres quickly with Docker (optional):

```bash
docker run --name connectx-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=connectx -p 5432:5432 -d postgres:16
```

Create the schema, then run the server:

```bash
npm run db:migrate            # applies db/schema.sql (idempotent) + seeds categories
npm run dev                   # watch mode on http://localhost:8000
```

Verify it's up:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/health        # includes a DB check
curl http://localhost:8000/api/v1/categories
```

### Scripts

| Script               | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `npm run dev`        | Start in watch mode (tsx)                      |
| `npm run build`      | Type-check + compile to `dist/`                |
| `npm start`          | Run the compiled server (`dist/index.js`)      |
| `npm run typecheck`  | Type-check only (no emit)                      |
| `npm test`           | Run the test suite once (Vitest)               |
| `npm run test:watch` | Run tests in watch mode                        |
| `npm run db:migrate` | Apply `db/schema.sql` to `DATABASE_URL`        |

## Response envelope

Every response uses the same shape as the frontend's `ApiResponse<T>`:

```jsonc
// success
{ "success": true, "data": { /* ... */ }, "status": 200 }
// error
{ "success": false, "error": "Human readable message", "status": 400 }
```

Authenticated requests send `Authorization: Bearer <access_token>`.

## API reference (v1)

Base URL: `http://localhost:8000/api/v1`

### Auth
| Method | Path             | Auth | Description                                  |
| ------ | ---------------- | ---- | -------------------------------------------- |
| POST   | `/auth/register` | —    | Create account + profile, returns tokens     |
| POST   | `/auth/login`    | —    | Email + password, returns tokens             |
| POST   | `/auth/refresh`  | —    | Rotate refresh token, returns new tokens      |
| POST   | `/auth/logout`   | —    | Revoke a refresh token                        |
| GET    | `/auth/me`       | ✅   | Current user summary                          |

### Profiles
| Method | Path            | Auth | Description                               |
| ------ | --------------- | ---- | ----------------------------------------- |
| GET    | `/profiles/me`  | ✅   | Full own profile                          |
| PATCH  | `/profiles/me`  | ✅   | Update editable profile fields            |
| GET    | `/profiles/:id` | —    | Public (PII-excluded) profile projection  |

### Categories
| Method | Path           | Auth | Description                            |
| ------ | -------------- | ---- | -------------------------------------- |
| GET    | `/categories`  | —    | Active categories with active job counts |

### Jobs & applications
| Method | Path                       | Auth | Description                                        |
| ------ | -------------------------- | ---- | -------------------------------------------------- |
| GET    | `/jobs`                    | —    | Paginated, filterable list of active jobs          |
| GET    | `/jobs/stats`              | —    | Aggregate counts                                   |
| GET    | `/jobs/:id`                | opt. | Job detail (owner can view non-active); counts a view |
| POST   | `/jobs`                    | ✅ (referrer/admin) | Create a posting                     |
| PATCH  | `/jobs/:id`                | ✅ (owner) | Update a posting                              |
| DELETE | `/jobs/:id`                | ✅ (owner) | Delete a posting                              |
| POST   | `/jobs/:id/apply`          | ✅   | Apply to a posting                                 |
| GET    | `/jobs/:id/applicants`     | ✅ (owner) | List applicants for a posting                 |
| GET    | `/jobs/me/applications`    | ✅   | The caller's applications                          |
| PATCH  | `/jobs/applications/:id`   | ✅ (job owner) | Move an applicant through the pipeline    |
| DELETE | `/jobs/applications/:id`   | ✅ (applicant) | Withdraw an application                    |

Job list query params: `page`, `per_page`, `category_id`, `job_type`,
`experience_level`, `work_mode`, `location`, `company_name`, `salary_min`,
`salary_max`, `is_featured`, `search_query`.

### Onboarding & services
| Method | Path                              | Auth | Description                                 |
| ------ | --------------------------------- | ---- | ------------------------------------------- |
| POST   | `/onboarding`                     | ✅   | Complete onboarding (syncs profile, code)   |
| GET    | `/onboarding`                     | ✅   | Current onboarding record                   |
| PATCH  | `/onboarding`                     | ✅   | Update onboarding fields                    |
| GET    | `/onboarding/verification-status` | ✅   | WP verification status + admin notes        |
| PUT    | `/services`                       | ✅   | Upsert a service config (price/availability)|
| GET    | `/services/me`                    | ✅   | The caller's service configs                |
| GET    | `/services/referrer/:id`          | —    | A referrer's service configs                |
| GET    | `/services/service/:serviceId`    | —    | Active configs for one service              |

### Marketplace & platform
| Method | Path                                   | Auth | Description                              |
| ------ | -------------------------------------- | ---- | ---------------------------------------- |
| GET    | `/marketplace/referrers`               | —    | Active referrers with aggregated ratings |
| GET    | `/marketplace/referrers/:id/reviewers` | —    | Reviewer avatars/snippets for a referrer |
| GET    | `/marketplace/users/by-code/:code`     | —    | Look up a member by user_code            |
| GET    | `/platform/stats`                      | —    | Aggregate platform stats                 |
| GET    | `/platform/features`                   | —    | Feature flags                            |
| GET    | `/platform/dashboard/referrer`         | ✅   | Incoming referral requests               |
| GET    | `/platform/dashboard/jobseeker`        | ✅   | The caller's job applications            |

### Reservations & requests
| Method | Path                              | Auth | Description                              |
| ------ | --------------------------------- | ---- | ---------------------------------------- |
| POST   | `/reservations`                   | ✅   | Lock a slot (15-min checkout hold)       |
| POST   | `/reservations/release`           | ✅   | Release a held slot                      |
| GET    | `/reservations/active/:referrerId`| ✅   | Active holds on a referrer's calendar    |
| POST   | `/referral-requests`              | ✅   | Create a referral request                |
| GET    | `/referral-requests`              | ✅   | Mine (as requester)                      |
| GET    | `/referral-requests/incoming`     | ✅   | Incoming (as referrer)                   |
| GET    | `/referral-requests/:id`          | ✅   | One request (participant only)           |
| POST   | `/referral-requests/:id/decline`  | ✅   | Decline (referrer)                       |
| POST   | `/resume-reviews`                 | ✅   | Create a resume-review request           |
| GET    | `/resume-reviews` · `/incoming` · `/:id` | ✅ | List mine / incoming / one              |
| POST   | `/resume-reviews/:id/decline`     | ✅   | Cancel (referrer)                        |
| POST   | `/resume-reviews/:id/feedback`    | ✅   | Deliver feedback (referrer)              |
| POST   | `/mock-interviews`                | ✅   | Create a mock-interview request          |
| GET    | `/mock-interviews` · `/incoming` · `/:id` | ✅ | List mine / incoming / one             |
| POST   | `/mock-interviews/:id/decline`    | ✅   | Decline (referrer)                       |

### Sessions, ratings & notes
| Method | Path                                        | Auth | Description                         |
| ------ | ------------------------------------------- | ---- | ----------------------------------- |
| POST   | `/referral-sessions` · `/mock-interview-sessions` | ✅ | Schedule a session            |
| GET    | `/{...}-sessions`                           | ✅   | My sessions (auto-completes past)   |
| GET    | `/{...}-sessions/busy/:referrerId`          | ✅   | Busy slots (no identity/price)      |
| GET    | `/{...}-sessions/:id`                        | ✅   | One session (participant)           |
| POST   | `/{...}-sessions/:id/reschedule` · `/cancel`| ✅   | Reschedule / cancel                 |
| POST   | `/ratings/referral-session/:id`             | ✅   | Rate a referral session             |
| POST   | `/ratings/mock-session/:id`                 | ✅   | Rate a mock interview               |
| POST   | `/ratings/resume-review/:id`                | ✅   | Rate a resume review                |
| GET    | `/notes?service=&request_id=`               | ✅   | Thread notes (participant)          |
| POST   | `/notes`                                    | ✅   | Add a note / action item            |
| PATCH  | `/notes/:id/action-item`                    | ✅   | Toggle an action item               |
| DELETE | `/notes/:id`                                | ✅   | Delete own note                     |

### Growth & lifecycle
| Method | Path                                  | Auth | Description                              |
| ------ | ------------------------------------- | ---- | ---------------------------------------- |
| POST   | `/referrer-upgrades`                  | ✅   | Request referrer upgrade                 |
| POST   | `/referrer-upgrades/self`             | ✅   | Self-upgrade (needs verified work email) |
| GET    | `/referrer-upgrades/me`               | ✅   | My latest upgrade request                |
| GET    | `/referrer-upgrades/admin/pending`    | ✅ (admin) | Pending queue                       |
| POST   | `/referrer-upgrades/admin/:id/approve`| ✅ (admin) | Approve + promote                   |
| POST   | `/referrer-upgrades/admin/:id/reject` | ✅ (admin) | Reject                              |
| GET    | `/success-stories`                    | —    | Approved stories                         |
| GET    | `/success-stories/referrer/:id`       | —    | Stories for a referrer                   |
| POST   | `/success-stories`                    | ✅   | Publish a story                          |
| POST   | `/events`                             | opt. | Batch-log analytics events               |
| GET    | `/external-jobs?company=`             | —    | Ingested external openings (read)        |
| GET    | `/account/export`                     | ✅   | Export all your data (DPDP)              |
| DELETE | `/account`                            | ✅   | Delete your account (irreversible)       |

### Integrations & advanced domains
| Method | Path                              | Auth | Description                                   |
| ------ | --------------------------------- | ---- | --------------------------------------------- |
| POST   | `/payments/orders`                | ✅   | Create a server-priced Razorpay order         |
| POST   | `/payments/verify`                | ✅   | Verify a checkout signature (fast path)       |
| POST   | `/payments/webhook`               | —    | Razorpay webhook (HMAC-verified, idempotent)  |
| POST   | `/video/join`                     | ✅   | Daily room + token for a session (join window) |
| POST   | `/ai/parse-resume`                | ✅   | OpenAI resume parsing                         |
| POST   | `/work-email/send-otp` · `/verify-otp` | ✅ | Company-email OTP (employment proof)      |
| POST   | `/auth/oauth/google` · `/oauth/linkedin` | — | Exchange a provider identity for our tokens |
| GET    | `/drops` · POST `/drops/cards`    | mixed | Weekly drops + card submission/screening     |
| GET/POST | `/trust/*`                      | ✅   | Consent, claims, evidence, verification, passports |
| POST   | `/trust/passports/redeem`         | opt. | Redeem a passport share token (view-limited)  |
| GET    | `/metrics/*`                      | ✅ (admin) | GMV, cohorts, acquisition               |
| POST   | `/storage/upload`                 | ✅   | Upload a file (multipart) → path + signed URL |
| GET    | `/storage/download/:token`        | —    | Download via short-lived signed token         |
| GET    | `/storage/resume-url`             | ✅   | Signed resume URL for a request participant   |

### Quick smoke test

```bash
# Register (also logs you in)
curl -s -X POST http://localhost:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Asha Rao","primary_email":"asha@example.com","password":"supersecret1","role":"referrer"}'

# Copy tokens.access_token from the response, then:
TOKEN=... # paste access_token
curl -s http://localhost:8000/api/v1/profiles/me -H "Authorization: Bearer $TOKEN"
```

## Security model

- **Passwords** are hashed with bcrypt (`BCRYPT_ROUNDS`, default 12).
- **JWTs** are signed/verified with a pinned algorithm (`HS256`) to prevent
  algorithm confusion.
- **Access tokens** are short-lived (default `1h`); **refresh tokens** are
  long-lived (default `30d`), tracked in `refresh_tokens`, and **rotated** on
  every refresh so a used refresh token cannot be replayed. `logout` revokes the
  refresh token **and** invalidates already-issued access tokens immediately via
  a per-user revocation marker in Redis (requires `REDIS_URL`; without it,
  access tokens simply expire at their short TTL).
- **Authorization** is enforced in the service layer (ownership + role checks),
  not via Postgres RLS — this backend connects with a single trusted role.
- **Payments**: the paid-order gate consumes the order in the **same
  transaction** as the booking insert (atomic, single-use); the Razorpay
  webhook is HMAC-verified over the raw body, idempotent, and **exempt from rate
  limiting** so gateway retries are never dropped.
- **Uploads** are served as `attachment` with `X-Content-Type-Options: nosniff`
  (never rendered inline) to prevent stored-XSS from user files.
- **OAuth** sign-in requires a provider-verified email before linking/creating
  an account.
- **Rate limiting**: a broad global limiter plus a stricter one on `/auth/*`.
  On top of the IP-based limiter, a **per-account login lockout** temporarily
  blocks an email after `LOGIN_MAX_FAILS` failed logins within
  `LOGIN_FAIL_WINDOW_MS` (requires Redis; **fails open** without it). This
  throttles targeted password guessing that rotates IPs.
- **Work-email OTP** codes are stored as a **keyed HMAC-SHA256** (peppered with
  `WORK_EMAIL_OTP_PEPPER`, bound to the challenge id) and compared in **constant
  time** — a leaked hash can't be brute-forced offline and codes can't be
  replayed across challenges.
- **AI resume parsing** (`/ai/parse-resume`) is gated behind an active
  `ai_processing` consent grant, so a user's resume is never sent to a
  third-party model without explicit, on-record consent.
- **CORS** is restricted to `CORS_ORIGINS`.
- **Public profile** projection deliberately omits PII (email, phone), matching
  the frontend's `PUBLIC_PROFILE_SELECT`.

## Testing

Tests run on **Vitest** with **supertest** for HTTP-level checks:

```bash
npm test            # run once
npm run test:watch  # watch mode
```

The suite is **hermetic and DB-free** — it needs no Postgres, Redis, or
credentials, so it runs anywhere (including CI) in a few seconds:

- `test/setup.ts` strips every optional integration/scaling variable from the
  environment before any module loads, so results never depend on a developer's
  shell or `.env` (a stray `RAZORPAY_KEY_ID` can't flip a fail-closed assertion,
  and tests never dial a real Redis). `config/env.ts` already skips `.env` under
  `NODE_ENV=test`; `vitest.config.mts` supplies the required placeholders.
- **Unit** — JWT sign/verify round-trip and rejection of wrong-secret,
  wrong-type, and tampered tokens; the storage download-token round-trip, token
  **type isolation** (an access token is not a download token), MIME mapping,
  and the local provider's **path-traversal guard**; the `ApiResponse` envelope
  and `AppError` mapping.
- **E2E** (supertest against the real `createApp`, no DB) — `/health` 200, the
  404 envelope, `/auth/login` validation 400, a protected route returning 401
  without a token, the payments webhook rejecting a missing signature (401), and
  an integration **failing closed with 503** when its credentials are absent.

Tests live in `test/` (outside `rootDir: src`), so `npm run build` never
compiles them into `dist/`.

## Scaling & operations (Phase 0)

The service is designed to run as **multiple stateless instances behind a load
balancer**. All shared state lives in Redis or Postgres, never in process
memory. Every new dependency is **optional and degrades gracefully**, so local
dev works with just Postgres.

- **Redis (optional).** Set `REDIS_URL` to enable a shared response cache
  (active categories, job stats) and **multi-instance-safe rate limiting**.
  Without it, rate limiting uses an in-memory store (correct for a *single*
  instance only) and caching is skipped. If Redis goes down at runtime, cache
  reads fall through to Postgres and the rate limiters **fail open** rather than
  erroring — a Redis blip never takes the API down.
- **Connection pooling.** `DB_POOL_MAX` / `DB_POOL_MIN` size each instance's
  pool. Budget `instances * DB_POOL_MAX` against Postgres `max_connections`, or
  (recommended at scale) run **PgBouncer** in transaction-pooling mode and pool
  freely.
- **Read replica (optional).** Set `DATABASE_REPLICA_URL` and route lag-tolerant
  reads through `queryReplica()` (it falls back to the primary when unset).
  Never use it for read-your-write paths.
- **Statement timeout.** `DB_STATEMENT_TIMEOUT_MS` caps how long any single
  statement may run (0 disables), so a runaway query can't hold a pooled
  connection and starve the app.
- **Buffered view counts.** Job-detail reads no longer write on the request
  path: view increments are buffered in-process and flushed to Postgres in one
  batched `UPDATE` on an interval (and on shutdown), removing hot-row lock
  contention on popular postings.
- **Trigram search.** `db/extend_20_jobs_scaling.sql` adds `pg_trgm` GIN indexes
  so the job search/filters (`ILIKE '%…%'`) are index-backed instead of
  sequential scans, plus a partial index for the default active-jobs browse.

### Local stack (Docker Compose)

`docker-compose.yml` brings up Postgres, **PgBouncer** (transaction pooling),
and Redis together:

```bash
docker compose up -d
# In .env, point the app at the pooler (6432) and Redis:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:6432/connectx
#   REDIS_URL=redis://localhost:6379
npm run db:migrate   # either port works; 5432 bypasses the pooler
npm run dev
```

**Why PgBouncer.** Each API instance keeps its own pool of up to `DB_POOL_MAX`
connections, and Postgres has a hard `max_connections` ceiling (~100 by
default), so `instances * DB_POOL_MAX` exhausts it quickly. PgBouncer in
**transaction** mode multiplexes many client connections onto a handful of real
backends, so you can scale instances freely. This codebase is transaction-
pooling safe — it holds no session-level state (no session `SET`,
`LISTEN`/`NOTIFY`, or cross-statement prepared statements). Keep it that way as
new modules land.

### Health & probe endpoints

| Method | Path                    | Purpose                                                        |
| ------ | ----------------------- | -------------------------------------------------------------- |
| GET    | `/health`               | Liveness (no dependencies) — top-level, for basic uptime checks |
| GET    | `/api/v1/health`        | Detailed: DB + cache status + uptime (503 if DB is down)        |
| GET    | `/api/v1/health/ready`  | **Readiness** for LB gating — ready when the primary DB is up   |
| GET    | `/api/v1/health/live`   | Liveness under the API base path                                |

Readiness deliberately does **not** require Redis: since the API degrades
gracefully without it, a Redis outage should not pull an instance out of
rotation.

## Data model

The schema is split across `db/` and applied in order by `npm run db:migrate`
(core first, then `extend_*.sql`). All files are idempotent.

- `db/schema.sql` — core: `users`, `refresh_tokens`, `profiles`, `categories`,
  `jobs`, `job_applications`, plus `updated_at` / `applications_count` triggers
  and a seeded category catalog.
- `db/extend_10_bookings.sql` — bookings + marketplace: `verified_work_emails`,
  `user_onboarding`, `platform_features`, `service_configurations`,
  `slot_reservations`, `referral_requests`, `resume_review_requests`,
  `mock_interview_requests`, `referral_sessions`, `mock_interview_sessions`,
  the three rating tables, `request_notes`, `referrer_upgrade_requests`,
  `success_stories`, `user_events`, `external_jobs`.

Shapes for categories/jobs/job_applications match `my-app` migration
`067_job_board.sql`; `profiles` mirrors the `Profile` interface in
`database.types.ts`. Instead of Supabase's `auth.users`, this backend owns a
`users` table that everything references.

## Coverage status

**Ported and working** (data + logic, runnable against Postgres):

- Auth (email/password, JWT + refresh rotation) + Google/LinkedIn OAuth, profiles (self + public)
- Onboarding + service configurations (pricing/availability) + work-email OTP (employment proof)
- Marketplace (referrers + aggregated ratings, reviewers, member lookup),
  platform stats/features, referrer & job-seeker dashboards
- Job board (jobs, categories, applications) + external-jobs read
- Slot reservations; referral / resume-review / mock-interview requests
- Referral & mock sessions (schedule/reschedule/cancel, busy slots, auto-complete)
- Ratings (all three surfaces), shared request notes
- Referrer upgrades (self-serve + admin review), success stories
- Analytics events, account export + deletion (DPDP)
- **Payments** (Razorpay): server-priced order lifecycle, client verify, idempotent webhook
- **Weekly referral drops**: cards, screening packets, referrer accept/ask/pass, preferences
- **Career-trust / passport**: consent, projects, claims (+competencies), link
  artifacts + evidence + inbox, disputes, proof summary, candidate + professional
  verification, attestations, passports with view-limited share tokens
- **Investor metrics** (admin): GMV, take rate, cohorts, acquisition channels

**Integration-bound** (implemented, but need credentials to actually run — each
sits behind an adapter that returns 503 with a clear error until configured):

- **Payments** — `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` (+ `PLATFORM_FEE_BPS`)
- **Video** (Daily.co room + token) — `DAILY_API_KEY`
- **Email** (Resend; durable `email_outbox` fallback) — `RESEND_API_KEY`, `SENDER_EMAIL`
- **AI** (OpenAI: resume parse + drop screening; deterministic fallback when off) — `OPENAI_API_KEY`
- **OAuth** — `GOOGLE_CLIENT_ID`, `LINKEDIN_CLIENT_ID/SECRET`

**Object storage** (`/storage`): file upload + short-lived signed-token download,
wired into trust file-artifacts and an authorized resume-URL endpoint. Two
providers sit behind one interface — a **local-disk** provider (zero-config
default) and an **S3** provider (`STORAGE_PROVIDER=s3`, also S3-compatible stores
like MinIO). Both keep objects private and stream downloads through the API
behind a signed token — never public or presigned URLs. Selecting `s3` requires
`STORAGE_S3_BUCKET` (boot **fails closed** without it); credentials come from the
standard AWS provider chain. The S3 SDK is loaded lazily, so local deployments
never pull it in.

**Paid-order gate**: referral / resume-review / mock-interview creation runs
through `enforceBookingPayment` — it consumes a paid, unconsumed order matching
buyer/seller/service (single-use, no double-spend). It is a no-op while
`payment_settings.enforce_payment_gate` is off (rollout), and hard-required once on.

**Still open / simplified:**

- **Career-trust hardening**: append-only audit log, full idempotency replay,
  and independence-key cryptography are simplified vs. the original RPCs.
- **Transactional email templates** for booking lifecycle events (the adapter +
  outbox exist; individual flow triggers aren't all wired).
- **CI pipeline**: the test suite exists (`npm test`, Vitest + supertest) and is
  hermetic; wiring it into a CI workflow is the remaining step.

Every module follows the same routes→controller→service→repository pattern, so
each open item slots in without reshaping the codebase.

### Verified against live Postgres

`npm run db:migrate` applies all 7 SQL files cleanly, and an end-to-end smoke
passed 15/15 (register → onboarding → services → job post → apply → applicants →
marketplace → trust consent/proof-summary), plus storage upload/download
roundtrip and the payment-gate accept/reject paths.

## Switching the frontend to this backend (later)

When ready, the frontend's `src/shared/services/api.ts` and `auth.ts` can be
repointed from the Supabase SDK to this API using the existing
`REACT_APP_API_URL` (already `http://localhost:8000/api/v1` in `.env.example`).
Because the response envelope and payload shapes already match, that change is
mostly swapping the transport (Supabase client → `fetch`) rather than reworking
call sites. Do it domain by domain behind a flag; this backend can run alongside
Supabase until the cutover is complete.

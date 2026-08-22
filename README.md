# Shaheen Edu — Auth/Identity Backend

Egyptian high-school edu platform backend, single-owner (not multi-tenant SaaS).
This repository currently implements exactly two things:

1. A production-oriented NestJS + Fastify + Prisma + PostgreSQL + Redis project skeleton.
2. The full authentication / identity / session / role / authorization system for
   four identity types (`SUPER_ADMIN`, `ADMIN`, `PARTNER`, `STUDENT`) plus a
   separate, lighter-weight parent-access session model.

No business modules (courses, payments, questions, AI, media, etc.) are
implemented — see [Out of scope](#out-of-scope) below.

## Prerequisites

- Node.js 24 LTS
- pnpm 10+
- Docker + Docker Compose (for local Postgres/Redis)

## Setup

The supported local-development workflow manages the API, PostgreSQL, and
Redis as one Docker Compose stack. Docker Compose is required; Node.js/pnpm
are only needed for running commands and tests outside the container.

```bash
pnpm install                 # once, to install command and test dependencies
pnpm dev:start               # creates .env if needed, builds, migrates, seeds, and starts everything
```

Health check: `GET http://localhost:3000/health`
Swagger UI: `http://localhost:3000/api/docs`

### Development lifecycle

```bash
pnpm dev:start    # initial build/start, or a fast restart after dev:stop
pnpm dev:stop     # stop services and retain all development data
pnpm dev:update   # rebuild API from current code, run migrations, retain data
pnpm dev:clear    # delete the entire local stack and PostgreSQL/Redis data
```

`dev:clear` only removes Docker resources belonging to this project. It does
not change source files or `.env`; the next `dev:start` creates a fresh data
store. The Compose Postgres/Redis ports are `5433`/`6380` on the host.

Note: the docker-compose Postgres/Redis ports are mapped to **5433/6380** on
the host (not the default 5432/6379), because those default ports were
already in use in the environment this was built in. `.env.example` already
points at 5433/6380 to match. If you don't have anything else on 5432/6379,
feel free to change the compose port mappings and `.env` back to the
defaults.

## Environment variables

All variables are validated at boot via Joi (`src/config/env.validation.ts`).
See `.env.example` for a fully worked, non-secret example set. Summary:

| Variable                                                     | Purpose                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `NODE_ENV`, `PORT`, `HOST`                                   | Basic app config                                                  |
| `DATABASE_URL`                                               | Postgres connection string (Prisma)                               |
| `REDIS_URL`                                                  | Redis connection string (rate limiting)                           |
| `CORS_ORIGINS`                                               | Comma-separated allowed CORS origins                              |
| `COOKIE_SECURE`                                              | Whether the refresh cookie requires HTTPS                         |
| `COOKIE_SECRET`                                              | Signing secret for `@fastify/cookie`                              |
| `JWT_ACCESS_SECRET` / `JWT_ACCESS_TTL_SECONDS`               | User access token (15 min default)                                |
| `JWT_REFRESH_TTL_SECONDS`                                    | Opaque refresh token TTL (30 days default)                        |
| `JWT_PARENT_ACCESS_SECRET` / `JWT_PARENT_ACCESS_TTL_SECONDS` | Parent access token (30 min default)                              |
| `RATE_LIMIT_*`                                                | Global, auth-route, identifier, and IP rate-limit thresholds       |
| `NATIONAL_ID_HMAC_SECRET`                                    | HMAC key for the deterministic National ID lookup hash            |
| `NATIONAL_ID_ENCRYPTION_KEY`                                 | Key material for AES-256-GCM National ID encryption               |
| `NATIONAL_ID_KEY_VERSION`                                    | Recorded alongside encrypted National IDs for future key rotation |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`                 | Used only by `prisma/seed.ts`                                     |

## Tests

```bash
pnpm test          # unit tests (co-located *.spec.ts)
pnpm test:e2e       # e2e tests against disposable Postgres + Redis Testcontainers
pnpm test:all       # unit tests, e2e tests, then a production build
```

The e2e suite starts its own PostgreSQL 16 and Redis 7 containers, applies
Prisma migrations, and removes them afterwards. It never reads `.env.test` or
touches the development stack. Docker must be running; failures to start it
include an actionable error.

e2e tests drive the app via Fastify's native `app.inject()` (no supertest -
it's Express-oriented and not installed).

## API surface

All routes are mounted under `/api/v1/...` except `/health` and
`/health/ready`, which are intentionally unversioned/unprefixed.

| Endpoint                                                         | Notes                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| `POST /api/v1/auth/students/register`                            | Public                                                   |
| `POST /api/v1/auth/students/login`                               | Public, rate-limited                                     |
| `POST /api/v1/auth/admins/login`                                 | Public, rate-limited (SUPER_ADMIN or ADMIN)              |
| `POST /api/v1/auth/partners/login`                               | Public, rate-limited                                     |
| `POST /api/v1/auth/parents/login`                                | Public, strictly rate-limited (nationalId + parentPhone) |
| `GET /api/v1/auth/parents/children`                              | Parent-session scoped                                    |
| `POST /api/v1/auth/parents/select-child`                         | Parent-session scoped                                    |
| `GET /api/v1/auth/parents/selected-child`                        | Parent-session scoped, requires a selected child         |
| `POST /api/v1/auth/refresh`                                      | Public (cookie-based rotation)                           |
| `POST /api/v1/auth/logout`, `/logout-all`, `GET /api/v1/auth/me` | Requires user access token                               |
| `POST /api/v1/auth/change-password`                              | Requires user access token, rate-limited                 |
| `/api/v1/admin/admins/*`                                         | SUPER_ADMIN only                                         |
| `/api/v1/admin/partners/*`                                       | SUPER_ADMIN or ADMIN                                     |
| `GET/PATCH /api/v1/students/me`                                  | STUDENT only, structural ownership                       |
| `GET /api/v1/partners/me`                                        | PARTNER only, structural ownership                       |

## Implementation decisions

- Refresh tokens are **opaque random tokens**, not JWTs — the `AuthSession`
  row (keyed by `sha256(token)`) is the single source of truth for rotation
  and revocation, which is what makes logout/logout-all/password-change
  actually invalidate a token immediately (a bare JWT can't be revoked
  without a server-side check).
- Refresh rotation implements reuse detection: reusing an already-rotated
  (revoked) refresh token revokes the entire rotation family, not just that
  one session.
- `UserAuthGuard` is registered as a global `APP_GUARD` (deny-by-default);
  routes opt out with `@Public()`. Parent-scoped routes are `@Public()` (to
  skip the _user_ guard, since a parent access token is a structurally
  different token) and separately apply `ParentAuthGuard` locally.
- National IDs are never stored or logged in plaintext: a HMAC-SHA256 hash
  is used for lookup/uniqueness, and a separate AES-256-GCM ciphertext is
  stored for the rare case a real value needs to be recovered manually.
  Pino redaction paths strip `password`/`nationalId`/`refreshToken`/
  `Authorization`/`Cookie` from all log lines.
- Login/password-change/refresh use a Redis-backed fixed-window rate
  limiter (`AuthRateLimitService`) keyed by a hash of the identifier — never
  the raw value — plus a per-IP counter. This is layered on top of (not a
  replacement for) `@nestjs/throttler`'s generic in-memory per-route
  limiting, since `nestjs-throttler-storage-redis` is deprecated and
  incompatible with this Nest 11 / throttler 6 setup.
- `/admin/admins/*` mutations always block any action targeting the seeded
  SUPER_ADMIN, including the super admin acting on itself — self password
  changes must go through `/auth/change-password`.
- `/students/me` and `/partners/me` never accept an id param — ownership is
  structural (`req.user.id`), and `UpdateStudentDto` is whitelist-only
  (combined with the global `ValidationPipe({whitelist:true,
forbidNonWhitelisted:true})`) so a student can never smuggle in
  `role`/`status`/`nationalId`/`password` fields.

## Known open items / unresolved product decisions

- **Egyptian National ID checksum is validated structurally only** (length,
  digit-only, century marker in `{2,3}`, valid month/day) — the final
  checksum digit is _not_ verified. This is a documented v1 shortcut.
- Rate-limit thresholds are configurable with the `RATE_LIMIT_*` variables in
  `.env.example`; changes take effect after restarting the API.
- `AccountStatus.DISABLED` exists in the Prisma enum but has no toggle
  endpoint yet (only `ACTIVE`/`SUSPENDED` are reachable via the admin API).
- Admin `PATCH /api/v1/admin/admins/:id` only updates `loginIdentifier`
  (email) — there's no other admin profile field in the schema yet.
- `StudentProfile.academicGradeId` is the optional canonical relation to an
  academic grade; the API accepts and exposes only that ID.

## Out of scope

No course, payment, subscription, question-bank, AI, media, or notification
modules are implemented in this repository. Only the auth/identity system
and empty placeholder module folders (to avoid future coupling) exist.


## notes:

test server link: https://api-edu.mydevtest.website/

  JOURNEY_REQUEST_TIMEOUT_MS=60000 \
  JOURNEY_ALLOW_MUTATIONS=true \
  JOURNEY_TARGET=staging \
  JOURNEY_CONFIRM_STAGING_MUTATIONS=true \
  JOURNEY_BASE_URL=https://api-edu.mydevtest.website \
  JOURNEY_SUPER_ADMIN_EMAIL=superadmin@example.com \
  JOURNEY_SUPER_ADMIN_PASSWORD='ChangeThisPassword123!' \
  pnpm api:test:full

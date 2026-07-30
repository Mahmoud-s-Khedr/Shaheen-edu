# Current user journeys

## INFRA-001 — Health and API discovery

Purpose: establish that the running service and exposed API document are reachable. Public; no data prerequisite. Calls health then Swagger JSON and asserts the health shape and OpenAPI paths. Rerun-safe. Script: `scripts/journeys/infrastructure/health.journey.ts`.

## AUTH-001 — Seeded super-admin session lifecycle

Purpose: bootstrap all privileged workflows from the seeded account. Requires migrations, seed, backend, and configured journey credentials. Login, read `/auth/me`, rotate refresh cookie, logout/reject revoked bearer, then login again. Asserts SUPER_ADMIN role, cookie presence/rotation, and session revocation. Script: `scripts/journeys/auth/super-admin-bootstrap.journey.ts`.

## AUTH-002 — Admin lifecycle

Purpose: manage a normal administrator. Depends on AUTH-001. Creates unique admin credentials, reads/updates the account, authenticates as the admin, rejects admin-on-admin creation, suspends/rejects login and refresh, reactivates/re-authenticates. Leaves uniquely named records. Script: `scripts/journeys/auth/admin-lifecycle.journey.ts`.

## AUTH-003 — Partner lifecycle

Purpose: manage a content-publisher partner. Depends on AUTH-002. Creates, updates, authenticates, reads the own profile, rejects admin-only mutations, suspends/rejects login, and reactivates. Script: `scripts/journeys/auth/partner-lifecycle.journey.ts`.

## AUTH-004 — Student registration, profile, password, and sessions

Purpose: validate the student-owned account path. Depends on AUTH-001. Registers unique synthetic data, validates normalized phone and National-ID non-disclosure, rejects duplicates/protected fields, updates profile, rotates refresh, verifies logout-all invalidation, changes password, confirms prior sessions fail, then logs in with the new password. Script: `scripts/journeys/auth/student-auth.journey.ts`.

## AUTH-005 — Parent multi-child scoped access

Purpose: validate parent identity and child scope. Depends on AUTH-001. Registers two children with a shared generated parent phone plus an unrelated child; parent login lists both, selects/switches children, and rejects invalid credentials and unrelated selection. Script: `scripts/journeys/auth/parent-multiple-children.journey.ts`.

## CONTENT-001 — Academic hierarchy administration lifecycle

Purpose: manage the full academic tree. Depends on AUTH-002. Creates grade → subject → course → chapter → lesson → section, validates parents/versioning, rejects invalid parent and student mutation, verifies parent-order publishing, reorders/moves siblings, and archives/restores a draft record. Script: `scripts/journeys/content/academic-hierarchy.journey.ts`.

## CONTENT-002 — Basic text and external-link content authoring

Purpose: author current supported basic content. Depends on CONTENT-001. Creates TEXT and HTTPS EXTERNAL_LINK items, validates exact placement/type rules, reads/updates/reorders/moves, archives/restores/deletes, and rejects partner mutation. Script: `scripts/journeys/content/basic-content-authoring.journey.ts`.

## CONTENT-004 — Public catalog browsing and personalized outline access

Purpose: validate public catalog discovery and personalized paid-content previews. Depends on CONTENT-001 and AUTH-004. Verifies default and filtered catalog collections, course detail ancestry, anonymous locked outline previews without protected payloads, and entitlement-based unlocks for the registered student. Script: `scripts/journeys/content/public-catalog.journey.ts`.

## CONTENT-009 — Student catalogue, access state, and library ownership

Purpose: validate the authenticated, grade-scoped catalogue. Depends on CONTENT-001 and AUTH-004. Creates an isolated paid hierarchy and student, verifies current-grade discovery, pricing inheritance/override, foreign-grade non-disclosure, chapter-only entitlement access, self-scoped paginated entitlements, and library retention after a grade change. Script: `scripts/journeys/content/student-catalog.journey.ts`.

Dependency graph: `INFRA-001 → AUTH-001 → AUTH-002 → { AUTH-003, CONTENT-001 → { CONTENT-002, CONTENT-003, CONTENT-004, CONTENT-009 } }`; `AUTH-001 → { AUTH-004, AUTH-005 }`; CONTENT-004 and CONTENT-009 also depend on AUTH-004.

## CONTENT-006 — Manual question-bank authoring and review lifecycle

Purpose: create a content-publisher source and question bank, publish both, author a single-choice question, validate option constraints, exercise review/rejection/revision/publishing, and verify archive and role protections. Depends on CONTENT-001 and AUTH-003. Script: `scripts/journeys/content/question-bank-authoring.journey.ts`.

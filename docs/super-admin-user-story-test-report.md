# Super administrator user-story test report

**Status:** Ready for API testing. This is an implementation-backed test pack; it describes the backend currently exposed and does not claim the scenarios have been executed.

**Actor:** An active `SUPER_ADMIN` account.

**API base path:** `/api/v1`

**Implementation reviewed:** super-admin bootstrap seed, administrator authentication and shared session/password flows, `AdminsController`/`AdminsService`, global authentication and forced-password-change guards, audit service/schema, DTOs, and `super-admin.e2e-spec.ts`. Reviewed 2026-09-10.

This report turns the **Super admin** section of [the user-story checklist](user-story-testing-checklist.md) into testable backend stories. A super administrator also satisfies all routes decorated for `ADMIN` and `SUPER_ADMIN`; run the shared operational stories in [the administrator user-story test report](admin-user-story-test-report.md) with a Super Admin token as a compatibility/regression pass. This report covers the additional account-governance authority and the boundaries that distinguish it from a normal administrator.

## Test conventions

`SUPER_ADMIN_A_TOKEN` is an active bootstrap super administrator. `ADMIN_A_TOKEN` and `ADMIN_B_TOKEN` are separate active normal administrators; B is the target for lifecycle/reset tests. `STUDENT_TOKEN`, `REFERRAL_TOKEN`, and `PUBLISHER_TOKEN` are wrong-role controls. Keep a second active session for each user whose session revocation is tested, and use a separate cookie jar for each browser/session.

Use synthetic email addresses and passwords only. Do not retain bearer tokens, refresh cookies, password hashes, temporary passwords, or signed URLs in test evidence. For protected routes, missing, malformed, expired, or revoked authentication must return `401`; an authenticated role that does not qualify must return `403`, using the standard bilingual error envelope and `correlationId`. Do not assert only an English message.

Unless a story states otherwise, exercise pagination with `page >= 1`, `limit` 1–100, final/empty pages, nonnumeric/fractional/out-of-range values, a trimmed 1–120-character search, and blank/oversize/unknown parameters. For every failed write, re-read the target and audit records to prove that no unintended mutation or successful audit event occurred.

## Coverage and current product boundaries

| Checklist capability | Current backend support | Coverage |
| --- | --- | --- |
| Production bootstrap of one configured Super Admin and secure administrator login/session/password management | Yes; bootstrap is the Prisma seed process, not a runtime API | `SUPER-BOOTSTRAP-001`, `SUPER-AUTH-001` |
| Create, list/search, and read normal administrators | Yes | `SUPER-ADMIN-DIRECTORY-001` |
| Update a normal administrator's login email | Yes; email is the only mutable administrator-profile field | `SUPER-ADMIN-LIFECYCLE-001` |
| Suspend/reactivate a normal administrator and invalidate access | Yes | `SUPER-ADMIN-LIFECYCLE-001` |
| Reset a normal administrator password and require password change | Yes | `SUPER-ADMIN-RESET-001` |
| Audit administrator creation, update, suspension, reactivation, reset, and initial seed | Yes in `AdminAuditLog`; no audit-log browsing API | `SUPER-AUDIT-001` |
| Operate all ordinary administrator APIs | Yes where controllers permit `ADMIN, SUPER_ADMIN` | Shared coverage: [administrator report](admin-user-story-test-report.md) |
| Create, list, edit, suspend, reactivate, reset, or delete a Super Admin through an API | No; `/admin/admins` intentionally targets `ADMIN` only | `SUPER-BOUNDARY-001` |
| Self-service Super Admin account/profile lifecycle, a generic audit-log UI/API, role/permission editor, notifications, frontend accessibility/loading/localisation | Not exposed by this backend | Product/frontend gap |
| “Last Super Admin” protection across multiple Super Admin accounts | Not applicable to runtime API: there is no API that mutates Super Admin accounts | Configuration/operational control |

## Required test data

| Alias | Required state |
| --- | --- |
| `SUPER_ADMIN_A` | Active account created through the configured seed path, known strong password, two browser sessions, and its seed audit record. |
| `SUPER_ADMIN_B` | Optional separately seeded active Super Admin, used only to prove that super-admin targets remain absent/blocked; do not assume normal deployments have more than one. |
| `ADMIN_A` | Active normal administrator with a known password, two sessions, mixed-case/whitespace login-email test values, and no business data required. |
| `ADMIN_B` | Another active normal administrator with two sessions. Use it for update, suspend/reactivate, and reset tests. |
| `ADMIN_SUSPENDED` | Normal administrator already `SUSPENDED`, to verify reset rejection and repeated lifecycle behavior. |
| `EXISTING_*` | A normal-admin email collision, a student/partner/super-admin email, malformed email strings, passwords of 7, 8, 128, and 129 characters, and a random nonexistent ID. |
| `AUDIT_*` | Database read-only fixture/query access for `AdminAuditLog`, including actor/target/action/metadata/correlation ID verification. There is no HTTP endpoint for this. |

## User stories

### SUPER-BOOTSTRAP-001 — Bootstrap a Super Admin without shipping a usable default credential

**Priority/Risk:** Critical — platform takeover.

**Sources:** `prisma/seed.ts`; environment/deployment configuration; `User`, `AdminAuditLog`, and `RefundPolicy` schema.

**User story:** As the platform operator, I want the initial Super Admin to be created only from explicit secure deployment configuration so that no predictable privileged account exists in a normal environment.

**Acceptance criteria:**

- Given either `SUPER_ADMIN_EMAIL` or `SUPER_ADMIN_PASSWORD` is absent, when the seed process runs, then it fails before creating a user. In production, also verify it fails when either initial-refund-policy integer is missing, nonnumeric, or outside its documented range; no partial Super Admin/refund-policy bootstrap may remain.
- Given an explicit email and a password of fewer than 12 characters, when the seed runs, then it fails before creating a Super Admin. Given valid values, then it trims/lowercases the email, stores an Argon2id password hash rather than the supplied password, creates an active `SUPER_ADMIN`, and does not print the password or hash in logs/evidence.
- Given a valid first bootstrap, when the seed runs again with the same normalized email, then it does not create a duplicate account or rotate/change the credential. It instead ensures the active refund policy and Egyptian geography exist. Given that email belongs to a non-Super-Admin account, then it fails rather than converting or overwriting the account.
- Given a successful first bootstrap, then one `SUPER_ADMIN_SEEDED` `AdminAuditLog` record identifies the created account as actor and target and has `metadata.source = "seed"`. Check the record only via controlled database evidence; the backend has no public audit-log endpoint.
- Given a normal runtime deployment, then no registration, promotion, or administrator-management endpoint can create a `SUPER_ADMIN`. Confirm secrets/default bootstrap values are absent from source-controlled environment files, deployment logs, response bodies, and test evidence.

**Test type:** Deployment/configuration, security, audit, regression. **Dependencies:** Disposable environment with seed/database access; secret-safe log capture.

### SUPER-AUTH-001 — Securely use the Super Admin session and own password

**Priority/Risk:** Critical — privileged session takeover.

**Sources:** `POST /auth/admins/login`; `GET /auth/me`; `POST /auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/change-password`; `AdminAuthController`, `SharedAuthController`, `AuthService`, `SessionService`, `UserAuthGuard`, and `AuthRateLimitService`.

**User story:** As a Super Admin, I want to securely sign in and control my sessions and password so that only I can exercise platform-governance privileges.

**Acceptance criteria:**

- Given active `SUPER_ADMIN_A` and correct credentials with email case/whitespace variations, when `POST /auth/admins/login` is called, then it returns `201`, an access token whose user role is `SUPER_ADMIN`, the normalized login identifier, and an HttpOnly refresh cookie. It returns no password hash, other user, or audit data.
- Given an unknown email, wrong password, normal-admin/student/partner credentials, suspended account, or malformed fields, when login is attempted, then the result is the same safe `401 Invalid credentials`. Repeated failures reach configured `429` throttling; a permitted later login clears the applicable failure state.
- Given a valid refresh cookie, when `POST /auth/refresh` is called, then it returns a usable access token and rotates the cookie. Missing, expired, replayed, revoked, wrong-session, suspended, or forced-password-change refresh attempts must fail without minting a session; replay must revoke the remaining refresh-token family.
- Given two active A sessions, when A calls `POST /auth/logout`, then only that bearer/session and its cookie become unusable. When A calls `/auth/logout-all` or successfully changes its password, then every A session is revoked, cookies are cleared as applicable, and only the new 8–128-character password can log in. Wrong old password or invalid new input changes neither credentials nor sessions.
- Given A is authenticated, when `GET /auth/me` is called, then it reports only A’s documented account fields and current `mustChangePassword` state. Missing/revoked tokens fail `401`; it never exposes the password hash, refresh-token data, or another account’s profile.
- Given a Super Admin must change a password (for example, a controlled database fixture), when a normal privileged route is called, then it returns `403 Password change required`; only the intended `me`, logout, logout-all, and change-password flows remain usable. Direct deep links and refresh cannot bypass the requirement.

**Test type:** API, security, rate-limit, session, regression. **Dependencies:** JWT/session configuration, Redis throttling, cookie-aware client.

### SUPER-ADMIN-DIRECTORY-001 — Create and find normal administrators safely

**Priority/Risk:** Critical — privileged-account provisioning and directory privacy.

**Sources:** `POST|GET /admin/admins`, `GET /admin/admins/:id`; `AdminsController.create/list/getById`, `AdminsService`, `CreateAdminDto`, `SearchPaginationQueryDto`.

**User story:** As a Super Admin, I want to provision and locate normal administrators so that operational access can be delegated without granting Super Admin authority.

**Acceptance criteria:**

- Given a valid unique email and an 8–128-character password, when A posts to `/admin/admins`, then it returns `201` with a new active user whose role is exactly `ADMIN`, normalized email, ID, timestamps, and no password/password hash/session data. The account can log in through `/auth/admins/login` as `ADMIN` and is denied `/admin/admins/*` routes.
- Given leading/trailing/case variants of an email, when creation succeeds, then the stored and returned `loginIdentifier` is trimmed/lowercased. Given a duplicate normalized email—including one owned by any role—an invalid email, a non-string field, a missing field, a 7- or 129-character password, or unknown body field, then creation fails safely and creates no account/audit success record.
- Given normal administrators created at different times and matching/nonmatching search terms, when `GET /admin/admins?page=&limit=&q=` is called, then it returns only role `ADMIN` records, newest-first with ID as deterministic tie-breaker, accurate `data`/`meta`, and case-insensitive Arabic-aware search behavior. No Super Admin account appears, including A or B.
- Given an existing normal administrator, when `GET /admin/admins/:id` is called, then it returns the documented summary only. A nonexistent ID, a student/partner ID, or a Super Admin ID returns `404 Admin not found`, without revealing whether that protected target exists.
- Given `ADMIN_A_TOKEN`, student, partner, anonymous, stale/revoked, or forced-password-change authentication, when each calls all directory routes with valid-looking data, then it is denied before reading or changing administrator data. Confirm a normal admin cannot use a newly created admin’s credentials/ID to elevate privilege.

**Test type:** API, authorization, validation, pagination/search, privacy, audit, regression.

### SUPER-ADMIN-LIFECYCLE-001 — Maintain and suspend normal administrator access

**Priority/Risk:** Critical — privileged-account integrity and access revocation.

**Sources:** `PATCH /admin/admins/:id`; `POST /admin/admins/:id/suspend`, `/:id/reactivate`; `AdminsController`, `AdminsService.update/suspend/reactivate`, `SessionService`.

**User story:** As a Super Admin, I want to update a normal administrator’s login identifier and suspend/reactivate their access so that administrator access remains current and can be stopped immediately when needed.

**Acceptance criteria:**

- Given active `ADMIN_B` and a unique valid email, when A patches B, then the returned and subsequently read `loginIdentifier` is trimmed/lowercased and B can log in only with the new identifier and existing password. A collision with any existing user, invalid/missing email, or unknown body field fails without changing B or creating `ADMIN_UPDATED`.
- Given B has two active sessions, when A posts `/admin/admins/:id/suspend`, then B’s status becomes `SUSPENDED`, all B refresh sessions are revoked, existing bearer tokens fail protected routes, refresh fails, and a fresh login returns the generic credentials denial. The successful response contains no session data.
- Given a suspended B, when A posts `/:id/reactivate`, then B becomes `ACTIVE` and may create a *new* session with its valid current password. Earlier bearer/refresh credentials remain unusable. Record the observed result of repeating suspend/reactivate, because this implementation sets the requested state without a transition/version conflict guard; it must never restore a revoked session or change an unrelated account.
- Given a random ID, a student/partner ID, or a `SUPER_ADMIN` ID, when update/suspend/reactivate is attempted, then normal non-admin targets return `404`, while mutation of a Super Admin target returns `403` through the explicit mutable-target guard. Re-read all targets to prove nothing changed.
- Given normal-admin tokens, other roles, anonymous requests, revoked sessions, and forced-password-change sessions, when they invoke lifecycle routes, then they are safely denied and create no administrator lifecycle event.

**Test type:** API, authorization, lifecycle, session revocation, validation, audit, regression.

### SUPER-ADMIN-RESET-001 — Issue a safe one-time administrator recovery credential

**Priority/Risk:** Critical — account recovery and privilege escalation.

**Sources:** `POST /admin/admins/:id/reset-password`; `AdminsService.resetPassword`; `SharedAuthController.changePassword`; `UserAuthGuard`; `SessionService`.

**User story:** As a Super Admin, I want to reset an active administrator’s password safely so that access can be recovered without leaving previous sessions or temporary access usable.

**Acceptance criteria:**

- Given active `ADMIN_B` with two sessions, when A resets B’s password, then the response returns `201` and a one-time `temporaryPassword` plus `passwordResetAt` only to A. The password is generated server-side, never persisted in logs/test evidence, stored only as a hash, and every B session is revoked in the same transaction as the credential update and audit entry.
- Given B signs in using that temporary password, when B tries an ordinary protected route (including `/admin/admins`), then the forced-password-change guard returns `403 Password change required`. `GET /auth/me`, logout/logout-all, and `POST /auth/change-password` remain available only as implemented; refresh must fail while `mustChangePassword` is true.
- Given B supplies the temporary password as `oldPassword` and a valid new password, when change-password succeeds, then `mustChangePassword` becomes false, all temporary-password sessions are revoked, and B can obtain a new normal `ADMIN` session. Wrong temporary/old password and invalid new values leave the flag, password, and session state unchanged.
- Given `ADMIN_SUSPENDED`, a disabled/non-admin/nonexistent target, or a Super Admin target, when reset is requested, then it fails safely (`409` for a non-active normal admin; `404`/`403` for the other target classes) without issuing a credential or changing sessions. A normal admin or any other role is denied before reaching reset logic.
- Given concurrent/repeated reset requests, then capture the actual outcome and confirm that each successful response’s temporary password is the only currently valid recovery credential, all older sessions are revoked, and every successful reset is separately audited. Treat concurrent reset serialization/idempotency as a high-risk regression observation: the endpoint has no idempotency key or version field.

**Test type:** API, security, forced-password-change, transaction/session, audit, concurrency regression.

### SUPER-AUDIT-001 — Preserve accountable administrator-account changes

**Priority/Risk:** High — incident investigation and governance.

**Sources:** `AuditService`; `AdminAuditLog` schema; `AdminsService`; `prisma/seed.ts`.

**User story:** As a Super Admin, I want administrator-account changes to be attributable so that privileged actions can be investigated and governed.

**Acceptance criteria:**

- Given A successfully creates, updates, suspends, reactivates, or resets B, then database audit evidence contains one corresponding event with A as `actorUserId`, B as target, target type `User`, a created timestamp, and the request correlation ID when request CLS is active. Expected actions are `ADMIN_CREATED`, `ADMIN_UPDATED`, `ADMIN_SUSPENDED`, `ADMIN_REACTIVATED`, and `ADMIN_PASSWORD_RESET`.
- Given create/update succeed, then audit metadata includes the normalized email. For suspend/reactivate/reset, record the actual metadata shape (currently no before/after snapshot is written); do not falsely assert that it contains old/new status or password values. Audit metadata must never contain a password, password hash, refresh token, or temporary password.
- Given duplicate/invalid/unauthorised/failed writes, then no success audit event is created. Given reset, verify the user update, session revocation, and `ADMIN_PASSWORD_RESET` record commit atomically; an injected transaction failure must leave no partial credential/session/audit combination.
- Given a tester needs to inspect the log, then use controlled read-only database access. Confirm that no `/admin/audit*` or generic audit-list endpoint is exposed, and that normal administrators cannot obtain audit records through administrator directory responses.

**Test type:** Audit, database integration, security, transaction regression. **Dependencies:** Controlled database fixture/query access and correlation-ID observability.

### SUPER-BOUNDARY-001 — Keep Super Admin authority narrow, deliberate, and non-self-destructive

**Priority/Risk:** Critical — governance lockout and privilege escalation.

**Sources:** `SuperAdminGuard`; `AdminsService.assertActorIsSuperAdmin` / `getMutableTargetOrThrow`; `RolesGuard`; administrator and shared admin routes.

**User story:** As the platform, I want Super Admin account authority to be isolated from normal administrator authority and unable to mutate Super Admin accounts so that operational users cannot escalate and governance accounts cannot be accidentally locked out through this API.

**Acceptance criteria:**

- Given `ADMIN_A_TOKEN`, each other authenticated role, anonymous requests, revoked tokens, and forced-password-change tokens, when they call every `/admin/admins` route with guessed IDs and valid-looking payloads, then they receive the appropriate safe `401`/`403`, no directory information or temporary credential leaks, and no account/audit mutation occurs. The service’s role re-check must deny a non-Super-Admin even if a controller guard is misconfigured.
- Given `SUPER_ADMIN_A_TOKEN`, when A lists/reads administrators, then no Super Admin appears. When A tries to read a Super Admin ID, it receives `404`; when A tries to patch, suspend, reactivate, or reset its own ID or `SUPER_ADMIN_B`, it receives `403` and nothing changes. There is intentionally no Super Admin creation/deletion/reset endpoint.
- Given a Super Admin token, when representative ordinary admin routes are called (for example student administration, hierarchy, content, commerce, reports, and partner operations), then the roles decorated `ADMIN, SUPER_ADMIN` accept the request subject to their own validation/business rules. Execute the full shared test pack in [the administrator report](admin-user-story-test-report.md); do not duplicate its detailed data-integrity assertions here.
- Given a normal administrator is created, suspended, reactivated, or reset, then it never becomes `SUPER_ADMIN`, and neither request payloads nor update routes accept `role`, `status` outside lifecycle endpoints, password hash, session fields, or arbitrary user attributes. A Super Admin’s own credential changes only through `/auth/change-password`, not `/admin/admins`.
- Given an operational review asks about loss of all Super Admin access, document the limitation: the runtime API has no last-Super-Admin mutation path to test. Recovery/multiple-Super-Admin governance is a deployment/database access procedure and must be separately approved, documented, and tested in a disposable environment.

**Test type:** API, authorization, negative security, regression, operational governance.

## Cross-role regression scenarios

- `SUPER-E2E-001`: Securely seed A → A logs in as `SUPER_ADMIN` → A creates B as `ADMIN` → B can perform a permitted ordinary-admin operation but receives `403` from `/admin/admins` → no Super Admin record appears in B’s directory access attempt.
- `SUPER-E2E-002`: A creates B → B opens two sessions → A suspends B → B’s bearer, refresh, protected operations, and new login all fail → A reactivates B → only a newly created B session works.
- `SUPER-E2E-003`: A resets B → all B sessions fail → B signs in with the temporary credential but is forced to change it → B changes it successfully → a fresh session works and old temporary/session credentials do not → audit trail contains only redacted accountable events.
- `SUPER-E2E-004`: A attempts all administrator-management operations against A and optional B Super Admin IDs → reads hide the account and writes are forbidden → both Super Admin accounts still authenticate with their original credentials. Repeat with `ADMIN_A` as actor to prove no elevation path.
- `SUPER-E2E-005`: A performs representative shared administrator work (content/hierarchy, student, commerce, report-export, and partner-finance operations) → identical role permissions to the administrator report are preserved, while only A can manage administrator accounts.

## Definition of ready to execute

- [ ] A disposable environment has explicit non-production bootstrap secrets and controlled seed/database access.
- [ ] Super Admin A, normal admins A/B, a suspended normal admin, wrong-role accounts, and two-session/cookie fixtures exist.
- [ ] The expected rate-limit configuration, refresh-token TTL, cookie flags, standard bilingual error response, and correlation-ID capture method are known.
- [ ] Read-only access to `AdminAuditLog` is available and evidence redaction rules cover temporary passwords, tokens, cookies, hashes, and IDs.
- [ ] The separate operational recovery procedure for Super Admin loss/multiple Super Admin governance has an owner; it is not represented as a tested runtime endpoint.
- [ ] Shared administrator scenarios are scheduled using a Super Admin token, with the [administrator report](admin-user-story-test-report.md) as their detailed acceptance-criteria source.

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

## CONTENT-015 — Student learning state and subject discovery

Purpose: validate private content activity/resume state, continue-learning
selection, active-subject aggregation and progress, subject-scoped hierarchy
search, entitlement boundaries, and safe locked-result rendering. Depends on
CONTENT-009. Script: `scripts/journeys/content/student-learning-state.journey.ts`.

Dependency graph: `INFRA-001 → AUTH-001 → AUTH-002 → { AUTH-003, CONTENT-001 → { CONTENT-002, CONTENT-003, CONTENT-004, CONTENT-009 → CONTENT-015 } }`; `AUTH-001 → { AUTH-004, AUTH-005 }`; CONTENT-004 and CONTENT-009 also depend on AUTH-004.

## CONTENT-006 — Manual question-bank authoring and review lifecycle

Purpose: create a content-publisher source and question bank, publish both, author a single-choice question, validate option constraints, exercise review/rejection/revision/publishing, and verify archive and role protections. Depends on CONTENT-001 and AUTH-003. Script: `scripts/journeys/content/question-bank-authoring.journey.ts`.

## CONTENT-014 — Asset preview, cover visibility, and archived student retention

Purpose: use a real Bunny cover upload to verify that every returned admin-preview, public-cover, and retained-student-cover delivery URL is fetched successfully. It also proves that anonymous archived access is denied and explicit snapshot revocation blocks the retained student. Depends on CONTENT-007. Script: `scripts/journeys/content/asset-access.journey.ts`.

## CONTENT-016 — Student and admin generated assessments

Purpose: validate the generated quiz/exam domain end to end. Depends on CONTENT-013. Authors a published course and three published questions, then: has a student generate a private standard assessment and confirms it is absent from another student's list and returns 403 on direct access; runs the full attempt lifecycle (start, autosave with EXAM-mode answers hidden, resume, submit, and full result review); has an admin hand-pick questions into a DRAFT custom assessment, confirms it is invisible to students until published, then publishes it and confirms it becomes visible to every entitled student with TUTOR-mode answers revealed immediately; and finally archives it and confirms it disappears from student lists. Script: `scripts/journeys/content/assessments.journey.ts`.

## CONTENT-019 — AI question import queue, worker, and review contract

Purpose: queue an admin-owned real question fixture from `example-questions`, wait for the configured worker and AI provider to finish, and validate its redacted queue summary, retained source text, generated review candidates, and PDF visual-media route. It rejects ambiguous input and non-admin access. The default fixture is `model1.md`; set `JOURNEY_AI_IMPORT_FILE=10-exams.pdf` or `book-images.pdf` to exercise the real PDF upload/transcription path. This is a staging-only Bunny journey and requires `OPENROUTER_API_KEY`, `AI_QUESTION_IMPORT_MODEL`, Redis, and the `ai-question-import-worker` service. Depends on CONTENT-006. Script: `scripts/journeys/content/ai-question-import.journey.ts`.

## CONTENT-021 — AI question explanation and re-answer review contract

Purpose: validates admin-only AI re-answer route registration, grounded/infer request validation, empty retained-run retrieval, missing-run responses, and non-admin denial without calling OpenRouter. Successful generation is covered by provider-client unit tests because journeys never depend on live model credentials. Depends on CONTENT-006. Script: `scripts/journeys/content/ai-question-explanations.journey.ts`.

All journey delivery APIs returning a browser URL (`url` or `embedUrl`) fetch that URL and consume its body; an issued URL alone is not treated as successful delivery.

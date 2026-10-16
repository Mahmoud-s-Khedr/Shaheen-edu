# Admin content permissions verification

Verified against baseline commit `109e336` on 2026-10-16. No schema or migration changes.

| Check | Result |
| --- | --- |
| `pnpm build` | Passed |
| `pnpm test --runInBand` | 1,184 passed; 8 failed in 2 suites, matching the original commit's failures |
| Administrative handler and service policy tests | Passed for every discovered administrative handler; restricted service entry points reject Admin before accessing dependencies |
| New moderation, grading, publisher, statistics and payment-proof unit tests | Passed |
| `pnpm test:e2e` | 313 passed; 38 failed in 5 suites. The original commit has the same 38 failures in the same 5 suites (299 passed) |
| Targeted admin, student-administration and question-filter e2e suites | 65 passed |
| Expanded question-filter e2e suite including both report route families and review mutations | 44 passed |
| OpenAPI generation | Passed using `.env.test` via dotenv |
| `pnpm api:contract:check` | Passed: all 453 operations match the detailed reference |
| `pnpm journey:test` | 13 passed |
| `git diff --check` | Passed |

The baseline unit failures are seven assessment visibility fixture failures (`gradeAssignments` missing) and one static Arabic exception-translation coverage failure. The unchanged full e2e failures affect entitlement/delivery setup, asset/video delivery, student device-session behavior and publisher analytics. The original commit was tested in a separate temporary checkout with the same local configuration; that checkout was removed afterward.

`pnpm api:test:full` was attempted against the configured isolated test environment. Live journeys could not start because Docker could not pull `minio/minio:RELEASE.2025-04-22T22-12-26Z` (pull access denied/repository unavailable); the companion MinIO client pull was interrupted. No live journey result is claimed. Journey fixture calls for restricted administration now use Super Admin, while content authoring continues to use Admin.

The [frontend handoff](../admin-content-permissions-frontend-handoff.md) documents the permission matrix, role-dependent response fields and rollout requirements. These changes have not been deployed.

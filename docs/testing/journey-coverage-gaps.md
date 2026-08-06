# Direct endpoint coverage gaps

The journeys cover each implemented actor workflow and every route family. The following route variants are inventoried but not individually invoked in the HTTP suite because they repeat the same generic hierarchy service behavior already exercised at another level; existing e2e tests cover their level-specific behavior.

- Hierarchy list/read/update/reorder/move/archive/restore/delete variants not used for every one of grade, subject, course, chapter, lesson, and section. CONTENT-001 invokes representative operations and validates the complete relationship chain, optimistic versioning, publish ordering, subject reorder/move, and grade archive/restore.
- Admin and partner collection list pagination is inventoried but not included in lifecycle scripts; creation, direct reads/updates, and role boundaries are exercised. Pagination contracts remain covered by the existing e2e suite.
- Single-child parent access is not a separate script: AUTH-005 includes the stricter multi-child flow, which also validates selection and scope for each child.
- Student content delivery, study state, continue learning, My Subjects, and
  subject search are covered by CONTENT-015. No future-media, upload, payments,
  questions, quiz, AI, bulk-import, analytics, or leaderboard API exists or is included.

These are deliberate journey-level consolidations, not claims that the omitted route variants do not exist.

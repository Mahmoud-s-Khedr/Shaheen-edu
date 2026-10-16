# Admin content permissions and dashboard handoff

`ADMIN` manages all platform educational content. `SUPER_ADMIN` retains full access. No new role, database migration, ownership restriction or course assignment is introduced. Existing Admin accounts and sessions receive the narrower permissions through backend enforcement.

| Area | Admin | Super Admin |
| --- | --- | --- |
| Academic hierarchy, educational content, video and content assets | Manage | Manage |
| Question sources, banks, questions, explanations and AI imports | Manage | Manage |
| Assessment authoring and publication; content pricing | Manage | Manage |
| Question statistics | Aggregate only | Aggregate only |
| Question reports, video feedback, pending answers and AI grading retries | Student identity omitted | Existing full response |
| Publisher selector | User IDs and display names | User IDs and display names |
| Students, Student 360, partners and administrator accounts | 403 | Manage |
| Publisher agreements, entitlements, commerce, referrals and finance | 403 | Manage |
| Platform reports and exports, managed geography and testimonials | 403 | Manage |

Login, refresh, logout, current-user lookup and personal password changes remain available. All existing publication prerequisites, including active publisher agreements, remain enforced. Super Admin configures agreements. Admins see the existing validation errors when publication prerequisites are missing. Publication, archiving and deletion retain existing reference and lifecycle protections.

## New endpoints

Both roles can use `GET /api/v1/admin/question-banks/publishers?q=...&page=1&limit=20`. It follows the existing Arabic-aware search and offset pagination conventions. It includes only active, non-deleted content publisher accounts; each `data` entry contains exactly `{ "userId": "...", "displayName": "..." }`, with the standard `meta` object. General `/admin/partners` endpoints require Super Admin.

Both roles can use `GET /api/v1/admin/questions/:id/statistics`. It returns `questionId`, `totalResponses`, `correctResponses`, `incorrectResponses`, `incorrectRate`, `difficultyBand` and `calculatedAt`. Counts default to zero and the last three fields to null when no aggregate exists. Unknown questions return 404. No student, response or attempt records are returned.

## Moderation and grading response contracts

Super Admin responses retain their existing shapes. Admin clients must allow the following fields to be absent:

- Video feedback has no `student` object. IDs, comment, rating, timestamps, video summary and content-item summary remain. An Admin request containing the `studentId` filter returns 403, even for a known student ID. Super Admin can continue using it.
- Both `/admin/question-reports` and `/admin/assessments/question-reports`, including their `/:reportId/review` mutations, return only report workflow fields (`id`, `questionId`, `type`, `note`, `status`, `resolutionNote`, `resolvedAt`, `createdAt`, `updatedAt`) and available question context. Question snapshots contain only `id`, `body`, `type`, `explanation`, `updatedAt`. Lists retain `_count.actions`. Student and assignee account relations and user IDs are omitted.
- `/admin/assessments/grading/pending` retains answer and attempt IDs, submitted answers, response version/language/input method, correctness/outcome, awarded points, grading feedback/time, active time and answer timestamps. Question context remains. The `attempt` contains only workflow IDs/status/times and an assessment `{ id, title }`. AI run summaries retain ID, status, response version/language, proposed score/outcome, feedback, model and timestamps; raw provider payloads and account data are omitted.
- `/admin/assessments/grading/answers/:answerId/retry-ai` applies the same answer projection to the mutation result. It retains the existing retry behavior. Manual score editing is outside this update.

Structured student names, login identifiers, student user IDs, profiles and unrelated account data are excluded from these Admin responses. Student-authored free text remains visible for moderation and grading and may itself contain personal information.

Payment proofs remain excluded from content asset listing, reads and previews. Known proof IDs cannot be completed by Admin or attached, archived or deleted through content asset paths.

## Dashboard implementation

Hide student, partner, administrator, agreement, commerce, finance, referrals, reporting/export, geography and testimonial navigation for Admin. Use content management as the Admin landing page. Use the publisher selector for content authoring instead of partner-list requests. Render moderation and grading screens without student cards or identity columns, and hide the video-feedback student filter. Treat 403 as an enforced role restriction; removing navigation alone is insufficient. Keep Super Admin navigation and existing full response handling.

## Deployment

Deploy the authorization changes across all API instances together to avoid mixed permissions. No account migration or token refresh is required. OpenAPI operations using `@Roles` carry `x-roles` and a documented 403 response; the generated reference is `docs-json.json`.

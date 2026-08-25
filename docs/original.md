# Original Requirements Coverage

Source: [`docs/MohamedDiab-Req.pdf`](MohamedDiab-Req.pdf) ("Sentivra —
Mohamed Diab Req.").

**Last code audit:** 2026-08-24
**Reviewed revision:** `69609e2`
**Scope:** backend implementation only. UI composition, charts, player UI, and
client-side navigation are considered client work when the API exposes the data
and commands they require.

## Summary

The codebase implements **43 of 49** requirement rows, with **5 partial** and
**1 not implemented**. This is **about 88% backend feature coverage**.

This is a source-code audit, not a restatement of earlier Markdown reviews.
The checked-in OpenAPI artifact currently contains **343 paths and 411
operations**. A feature is marked complete only when the current controller and
service/schema implementation provide the needed backend behaviour. It does
not imply that external production credentials or deployment configuration have
been validated.

## Status legend

- [x] **Complete** — current code exposes the requested backend capability.
- [-] **Partial** — a material part of the requested capability is absent.
- [ ] **Not implemented** — no backend equivalent currently exists.

## Evidence index

| Area | Current code evidence |
| --- | --- |
| Identity, student and partner administration | [`src/modules/auth`](../src/modules/auth), [`src/modules/students`](../src/modules/students), [`src/modules/partners`](../src/modules/partners), [`prisma/schema.prisma`](../prisma/schema.prisma) |
| Catalogue, learning, access and media | [`src/modules/catalog`](../src/modules/catalog), [`src/modules/learning`](../src/modules/learning), [`src/modules/entitlements`](../src/modules/entitlements), [`src/modules/assets`](../src/modules/assets), [`src/modules/videos`](../src/modules/videos) |
| Questions and assessments | [`src/modules/question-banks`](../src/modules/question-banks), [`src/modules/assessments`](../src/modules/assessments), [`src/modules/ai-question-explanations`](../src/modules/ai-question-explanations) |
| Performance and leaderboard | [`src/modules/performance`](../src/modules/performance), [`src/modules/leaderboard`](../src/modules/leaderboard) |
| Commerce and finance | [`src/modules/commerce`](../src/modules/commerce), [`src/modules/partner-finance`](../src/modules/partner-finance), [`src/modules/referrals`](../src/modules/referrals) |
| Reporting and imports | [`src/modules/reports`](../src/modules/reports), [`src/modules/ai-question-import`](../src/modules/ai-question-import) |

## Module 1 — Welcome section

| Status | Requirement | Current backend coverage |
| --- | --- | --- |
| [x] | Question-bank usage: total, used, unused, and percentage | `GET /student/performance/overview` calculates the eligible, used, unused, and percentage values across assessment and practice activity. |
| [x] | Score: correct, incorrect, and omitted totals | Performance overview and completed assessment results expose these outcomes. |
| [x] | Total correct percentage | Overview and assessment-result responses expose accuracy. |
| [x] | Total used percentage | Overview exposes `questionBank.usagePercent`. |
| [x] | Course progress | `GET /student/progress` and owned-library progress return completion rollups. |

## Module 2 — Courses and learning

| Status | Requirement | Current backend coverage |
| --- | --- | --- |
| [x] | My courses / subscribed subjects | `GET /student/my-subjects` groups active course/chapter access by subject; `/student/library` provides cross-grade owned content. |
| [x] | Subject card metadata, access state, and progress | Catalogue/library responses expose metadata, covers, locks, entitlement state, price state, and rollups. |
| [x] | Continue studying | `GET /student/learning/continue` plus study-state/video-resume write support. |
| [x] | Subject details and hierarchy | Grade-scoped student catalogue routes expose subject through content-item hierarchy and access state. |
| [-] | Subscribe to a new subject | The commerce target enum and order model support only courses and chapters, not a subject product/subscription. |
| [x] | Chapter, lesson, and section lists | Ordered, cursor-paginated hierarchy child routes exist. |
| [x] | Video player and protected assets | Entitled content, protected asset URLs, Bunny Stream playback/upload, and resume position are implemented. |
| [x] | Subject/chapter/lesson progress indicators | Current-grade and owned-library endpoints expose hierarchy rollups. |
| [x] | Mark hierarchy content complete | Individual content items are completed explicitly; ancestor completion is derived from accessible descendants. |
| [x] | Topics/concepts in a video | Admin video outlines support ordered topics, concepts, and timestamps; delivery can include them. |
| [x] | Previous/next navigation and course outline data | Stable ordered hierarchy responses provide the data needed by the client. |
| [x] | Search chapters, lessons, and sections | `GET /student/catalog/search` returns matched published nodes, breadcrumbs, and access state. |

## Module 3 — QBank, quizzes, history, and results

| Status | Requirement | Current backend coverage |
| --- | --- | --- |
| [x] | Standard/custom quiz generation from filters | Student standard generation and admin standard/custom generation support scope, source, bank, difficulty, state, mark, count, mode, and timer controls. |
| [x] | AI-prompt quiz | `POST /student/assessments/ai-prompt` uses an AI selection plan constrained to entitled, eligible questions and records the run. |
| [x] | Source/scope/bank/difficulty/mark/history filters | The student generation DTO and eligible-question implementation support the listed filters. |
| [x] | Quiz timeline, saved/completed/suspended states, search, and pagination | Assessment list, overview, and attempt lifecycle routes provide this data. |
| [x] | Resume, rename, delete, submit, and review | Student assessment and current-attempt routes implement the lifecycle. |
| [x] | Score, outcomes, explanations, and performance tables | Frozen result data includes answers, outcomes, scores, placements, explanations, and active time. |
| [x] | Subject/chapter/topic assessment analytics | `GET /student/assessments/analytics/summary` provides hierarchy rollups and drill-down. |
| [x] | AI explanations and video timestamps in assessment review | Assessment snapshots include structured explanations and question-video timestamp data; admin AI review/apply flows are implemented. |

## Module 4 — Leaderboard

| Status | Requirement | Current backend coverage |
| --- | --- | --- |
| [-] | Weekly top-five honor board, Friday reset, medals/prizes, and rewards | Friday/Cairo windows, persisted history, top-five board, and gold/silver/bronze labels are implemented. A top-five AI-credit prize/fulfilment system is not. |
| [x] | Full ranking table and exact position | Current and historical routes return pagination and `myRank`; current implementation ranks platform-wide. |
| [x] | Smart Score formula | `LeaderboardService` calculates full-precision `accuracyPercent * 0.6 + totalQuestions * 0.4`. |
| [x] | Accuracy and ranking columns | Rows expose rank, masked name, quiz/question counts, correct count, accuracy, Smart Score, and award label. |

## Module 5 — Performance

| Status | Requirement | Current backend coverage |
| --- | --- | --- |
| [x] | Test counts, QBank usage, and score outcomes | Unified performance overview covers assessment and direct-practice activity. |
| [x] | Answer-change analysis | `GET /student/performance/answer-changes` lists and totals correct-to-incorrect and incorrect-to-correct changes. |
| [x] | Analysis by curriculum hierarchy | Searchable subject/course/chapter/lesson/section rollups are available. |
| [x] | Peer percentile/distribution comparison | Privacy-safe grade-cohort buckets, average, median, and percentile are implemented. |
| [x] | Accuracy trends and filters | Daily unified trends and improving/stable/declining classification are available. |
| [x] | Best/worst and recommendation insights | Insights return strongest/weakest scopes, omissions, repeated errors, trend evidence, and recommendation labels. |

## Roles and permissions

| Status | Requirement | Current backend coverage |
| --- | --- | --- |
| [-] | Admin user management for students, parents, and companies | Students, admins, and partners have directory/lifecycle APIs. There is no durable parent account or parent administration model. |
| [x] | Admin student data, payments, subscriptions, and performance dashboard | Audited Student 360 provides profile/contact/access/commerce/performance summaries plus paginated orders, entitlements, assessments, and audit history. |
| [ ] | Admin parent management | There is no parent directory, parent support detail, relationship management, or parent-account revoke/suspend workflow. |
| [-] | Partner company, assigned subjects, students, payments, and revenue share | Publisher agreements, allocations, settlements, referrals, and privacy-safe aggregate partner reporting exist. There is no per-learner partner model/view. |
| [x] | Content management, uploads, and PDF-to-question generation | Hierarchy/content/asset/video/question CRUD and review are implemented. AI imports include raw text/PDF/TXT, visual PDF OCR, page retry/review, candidate review, and per-item accept/reject into draft questions. |
| [x] | Pricing, discounts, coupons, and payments | Course/chapter pricing, promotions, coupons, manual proof flow, Paymob hosted checkout/webhook flow, expiry, receipts, and manual refund lifecycle are implemented. |
| [x] | Subscriber export and payment/revenue reporting | Audited aggregate reports and queued private CSV exports with protected download URLs are implemented. |
| [x] | Admin access and platform control | Admin/super-admin auth, guards, audit records, and administration surfaces are implemented. |
| [x] | Student registration and learning | Registration, protected catalogue/content, learning, practice, commerce, assessments, performance, and leaderboard APIs are implemented. |
| [x] | Student progress tracking including Smart Score and percentile | Learning rollups, performance trends/percentiles, and Smart Score leaderboard support are implemented. |
| [-] | Parent registration and monitoring | Selected-child parent sessions can monitor learning and performance, but there are no persistent parent accounts, relationships/consent, recovery, or child commerce/receipt reads. |
| [x] | Separate parent access | Parent session tokens are separate from user tokens and enforce selected-child authorization. |
| [x] | Partner account created by admin | Admin partner create/list/update/suspend/reactivate and partner login/profile are implemented. |
| [x] | Partner dashboard and reports | Content-publisher dashboards/usage/earnings and referral partner aggregate reports/settlements are implemented. |

## Deliberate current product boundaries

These are not unimplemented code paths; they require a product decision before
they should be planned as new work:

- Subject-level products/subscriptions are not part of the commerce model.
- Per-student AI chat, hints, or on-demand explanations are not provided;
  question explanations are admin-reviewed reusable content.
- Partners receive privacy-safe aggregate reporting, not learner identity data.
- Video outlines are delivery metadata rather than assessment scopes.

## Verification performed on the reviewed revision

- `pnpm exec prisma validate` passed.
- `pnpm build` passed.
- `pnpm exec jest --runInBand` passed: **58 suites, 357 tests**.

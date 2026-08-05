# Original Requirements Coverage

Source: [`docs/MohamedDiab-Req.pdf`](docs/MohamedDiab-Req.pdf) ("Sentivra - Mohamed Diab Req.").

Last reviewed: 2026-08-05. This is a conservative, backend-only assessment of
the code in this repository. It does not treat an API primitive as a completed
student-facing screen, chart, or workflow unless the requested workflow is
implemented end-to-end.

## Status legend

- [x] **Complete** — the repository implements the requested backend
  capability end-to-end.
- [-] **Partial** — useful supporting data, APIs, or administration features
  exist, but the original workflow is incomplete.
- [ ] **Not implemented** — no delivered equivalent exists.

## Code evidence key

Every `[x]` and `[-]` table row cites one or more evidence IDs below. A
`[ ]` finding is based on the absence of a corresponding model/controller in
the relevant delivered modules, not on an assumption about a frontend outside
this repository.

| ID | Code evidence |
| --- | --- |
| E-LEARN | Student completion, progress, direct practice, attempts, performance, and parent summary: [`learning.controller.ts`](src/modules/learning/learning.controller.ts#L14-L41) and [`learning.service.ts`](src/modules/learning/learning.service.ts#L18-L198). |
| E-CATALOG | Published catalogue discovery and cursor-paginated hierarchy traversal (course chapters, chapter lessons, lesson sections, and direct content previews), with entitlement-aware student equivalents: [`catalog.controller.ts`](src/modules/catalog/catalog.controller.ts#L10-L50), [`catalog.service.ts`](src/modules/catalog/catalog.service.ts#L38-L290), [`student-catalog.controller.ts`](src/modules/catalog/student-catalog.controller.ts#L45-L64), and [`student-catalog.service.ts`](src/modules/catalog/student-catalog.service.ts#L148-L444). |
| E-COMMERCE | Student cart, checkout, orders, payment proof, and admin payment review endpoints: [`commerce.controller.ts`](src/modules/commerce/commerce.controller.ts#L12-L57). |
| E-QUESTION | Admin question-source and question-bank endpoints: [`question-banks.controller.ts`](src/modules/question-banks/question-banks.controller.ts#L37-L105); source types: [`schema.prisma`](prisma/schema.prisma#L135-L158). |
| E-VIDEO | Admin video asset creation, direct upload, and playback support: [`videos.controller.ts`](src/modules/videos/videos.controller.ts#L23-L70). |
| E-DATA | Persisted student profile, parent session, completion, question attempts, entitlements, and manual-payment records: [`schema.prisma`](prisma/schema.prisma#L206-L285) and [`schema.prisma`](prisma/schema.prisma#L782-L977). |
| E-AUTH | Student and parent registration/access flows: [`student-auth.controller.ts`](src/modules/auth/controllers/student-auth.controller.ts#L25-L75) and [`parent-auth.controller.ts`](src/modules/auth/controllers/parent-auth.controller.ts#L55-L165). |
| E-PARTNER | Admin partner create/list/update/suspend/reactivate: [`admin-partners.controller.ts`](src/modules/partners/controllers/admin-partners.controller.ts#L28-L94). |
| E-HIERARCHY | Admin CRUD and publishing modules for subjects, courses, chapters, lessons, and sections: [`app.module.ts`](src/app.module.ts#L45-L52), plus their controllers under [`src/modules`](src/modules). |

## Recent delivery progress

The catalogue no longer returns an unbounded nested course outline. Published
hierarchy data is now retrieved one level at a time using stable cursor
pagination (`cursor`, `limit`, default 20, maximum 100):

- Public: `GET /catalog/courses/:id/chapters`,
  `GET /catalog/chapters/:id/lessons`,
  `GET /catalog/lessons/:id/sections`, and
  `GET /catalog/:resource/:id/content-items`.
- Student: the same routes below `/student/catalog`, scoped to the student's
  current grade and enriched with effective `access` and `isLocked` values.

Each child response uses `{ parent, data, pageInfo }`. Content results remain
preview-only: protected bodies, storage keys, and asset URLs are not exposed.
The former `GET /catalog/courses/:id/outline` and
`GET /student/catalog/chapters/:id` routes have been replaced by these routes.

## Module 1 — Welcome section

| Status | Original requirement | Current coverage / gap |
| --- | --- | --- |
| [-] | **Question Bank Usage**: total, used, unused questions, and usage percentage. | `GET /api/v1/student/performance` returns basic question totals, solved count, accuracy, and first-try correctness. It does not return total eligible bank size, used/unused counts, or usage percentage. [E-LEARN, E-DATA] |
| [-] | **Your Score**: correct, incorrect, and omitted totals. | Direct-practice attempts persist correct/incorrect outcomes (`StudentQuestionAttempt`). Omitted/skipped answers and a complete dashboard score breakdown are absent. [E-LEARN, E-DATA] |
| [-] | **Total Correct**: correct answers as a percentage of attempted questions. | Basic accuracy is implemented by `GET /api/v1/student/performance`; the requested Welcome-section presentation is not. [E-LEARN] |
| [ ] | **Total Used**: attempted questions as a percentage of the total bank. | No total eligible-question denominator or usage-percentage API. |
| [-] | **Course Progress**: selected-course completion percentage. | `GET /api/v1/student/progress` and `GET /api/v1/student/library/{targetType}/{targetId}/progress` derive completion from completed accessible content. No Welcome selected-course dashboard endpoint. [E-LEARN, E-DATA] |

## Module 2 — Courses and learning

| Status | Original requirement | Current coverage / gap |
| --- | --- | --- |
| [-] | **My Courses**: all subscribed subjects. | `GET /api/v1/student/library` returns active entitled courses/chapters. It does not present a subscribed-subject list as specified. [E-CATALOG, E-DATA] |
| [-] | **Subject card**: name, cover, subscription state, progress. | Catalogue and library responses expose hierarchy, covers, access state, and progress is separately available. No single subject-card response or UI workflow. [E-CATALOG, E-LEARN] |
| [ ] | **Continue studying**: subject, cover, subscription state, and progress. | No last activity, resume position, or continue-learning API. |
| [-] | **View subject details**: chapters, lessons, videos, and question bank. | The public and student catalogue APIs now expose published course chapters, chapter lessons, lesson sections, and direct content previews through bounded cursor-paginated routes. Student responses include access/lock state; direct practice is scoped to hierarchy. Question-bank metadata is intentionally not exposed to students and no unified subject-detail workflow exists. [E-CATALOG, E-LEARN, E-QUESTION] |
| [-] | **Subscribe to new subject**. | A student can buy a course or chapter through cart, checkout, manual proof submission, and approved entitlements. Subject-level subscriptions are not supported. [E-COMMERCE, E-DATA] |
| [-] | **Chapter list** in the selected subject. | `GET /api/v1/catalog/courses/:id/chapters` and its student equivalent return bounded published chapter pages. The PDF’s subject-oriented view is not a standalone endpoint. [E-CATALOG] |
| [-] | **Expand/collapse chapters** to show lessons. | `GET /api/v1/catalog/chapters/:id/lessons` supplies the data needed to expand a chapter; expand/collapse itself is a frontend behavior and no client is in this repository. [E-CATALOG] |
| [-] | **Lesson list** in a chapter. | `GET /api/v1/catalog/chapters/:id/lessons` and the student equivalent return bounded published lesson pages. [E-CATALOG] |
| [-] | **Expand/collapse lessons** to show sections. | `GET /api/v1/catalog/lessons/:id/sections` supplies the data needed to expand a lesson; UI interaction is not implemented here. [E-CATALOG] |
| [-] | **Section list** in a lesson. | `GET /api/v1/catalog/lessons/:id/sections` and the student equivalent return bounded published section pages. [E-CATALOG] |
| [-] | **Video player** for selected lesson/section. | Protected content delivery, protected asset URLs, and Bunny Stream playback are implemented. A learner-facing player and playback/resume tracking are not. [E-LEARN, E-VIDEO] |
| [-] | **Progress indicators** for subject, chapter, and lesson. | Current-grade and owned-library completion rollups include course/chapter/lesson/section nodes. Subject aggregation and UI indicators are missing. [E-LEARN] |
| [-] | **Mark chapter, lesson, or section complete**. | `POST /api/v1/student/content-items/{id}/complete` marks an accessible content item; higher-level completion is derived. Directly marking a chapter, lesson, or section complete is not supported. [E-LEARN, E-DATA] |
| [-] | **Video content**: topics/concepts in the selected video. | Content items expose title, description, type, duration, and attachments. No dedicated topic/concept metadata or learner video-details view. [E-CATALOG] |
| [ ] | **Navigation controls**: previous/next lesson or section. | No next/previous or resume-navigation API. |
| [-] | **Course outline**: Chapters → Lessons → Sections. | The published hierarchy is delivered through bounded, one-level-at-a-time routes rather than one nested response. Student routes resolve effective access and lock state at every returned node and content preview. A frontend still needs to assemble and render the outline. [E-CATALOG] |
| [ ] | **Search content**: chapters, lessons, sections within a subject. | No learner hierarchy search endpoint. |

## Module 3 — QBank, quizzes, history, and results

### Quiz generation and filters

| Status | Original requirement | Current coverage / gap |
| --- | --- | --- |
| [ ] | **Standard quiz** generated from the student’s filters. | There is no generated assessment/quiz domain. |
| [ ] | **Custom quiz** with chapter, lesson, section, source, count, and difficulty selections. | No quiz-builder, persisted quiz, question-selection service, or custom criteria API. |
| [ ] | **AI prompt quiz** based on a student prompt and criteria. | No AI integration or AI-generated assessment capability. |
| [-] | **Question scope**: chapters, lessons, or sections. | Direct practice accepts one course/chapter/lesson/section scope and descendants via `GET /api/v1/student/practice/questions`; it is not a multi-select quiz builder. [E-LEARN] |
| [-] | **Question source**: platform, external books, previous exams, ministry models. | Admin question sources support `PLATFORM`, `EXTERNAL_BOOK`, `PREVIOUS_EXAM`, and `MINISTRY_MODEL`; students cannot select/filter sources. [E-QUESTION] |
| [ ] | **Question status**: unused, used, marked, incorrect, omitted, all. | Per-question direct-practice attempt history exists, but no filter states, marking/bookmarks, omitted state, or all-question quiz selection. |
| [ ] | **Community incorrect questions**: questions with the highest platform-wide incorrect rate. | No aggregate question-quality/incorrect-rate analytics for students. |
| [-] | **Course selection** from subscribed learning content. | Direct practice can scope an eligible question request to a course; it does not generate a quiz or supply the subscription-selector workflow. [E-LEARN] |
| [-] | **Question bank selection**. | Question banks and sources exist for authoring/admin use only; they are intentionally excluded from learner APIs. [E-QUESTION, E-LEARN] |
| [-] | **Multiple chapter, lesson, and topic/section selection**. | Direct practice supports one hierarchy scope, not multiple selections. [E-LEARN] |
| [ ] | **Marked questions** filter. | No student question-bookmark/mark model. |
| [-] | **Unused / correct / incorrect question filters**. | Attempts record correct/incorrect results and can be read per question. There is no learner-side filter or quiz-generation integration. [E-LEARN, E-DATA] |
| [ ] | **Omitted questions** filter. | No skipped/omitted attempt state. |
| [ ] | **All questions** filter. | No learner question-bank browser or generated-quiz selector. |
| [ ] | **Difficulty bands A+ to D**, based on platform incorrect rates (A+ ≥90%, A 85–90%, B 80–85%, C 70–80%, D <70%). | No community-rate calculation, derived difficulty field, or learner filter. |
| [ ] | **Question count** selector with a maximum of 50 and increment/decrement/manual input. | No quiz request, count validation, or maximum-50 contract. |
| [ ] | **Generate Quiz** using course, bank, hierarchy, source/type, difficulty, mode, and timer settings. | No assessment creation, timer, mode, or persisted generated-question snapshot. |

### Quiz timeline and saved tests

| Status | Original requirement | Current coverage / gap |
| --- | --- | --- |
| [ ] | **Quiz timeline** in chronological order. | No quiz records. |
| [ ] | **Quiz card** with name, date, and time. | No quiz metadata or list endpoint. |
| [ ] | **View quiz review** with questions, answers, explanations, and student answers. | Direct-practice feedback is immediate and per attempt; no immutable quiz review. |
| [ ] | **Saved/completed/suspended test summary**. | No test lifecycle or summary. |
| [ ] | **Entries-per-page, status filter, search, table, and pagination** for quiz history. | No quiz-history data set. |
| [ ] | **Quiz table fields**: name, score, date, mode, status, subject, question count, actions. | No persisted quiz/attempt model. |
| [ ] | **View results, resume, rename, and delete quiz**. | No suspended attempt, rename/delete operation, or result page. |

### Test results and question review

| Status | Original requirement | Current coverage / gap |
| --- | --- | --- |
| [ ] | **Overall score, performance overview, circular chart, and final percentage**. | No submitted quiz result model. Basic direct-practice performance is not a quiz result. |
| [ ] | **Platform average, score comparison, and performance gap**. | No comparable common quiz attempts or cohort average. |
| [ ] | **Best subject/topic, needs improvement, and most omitted**. | No assessment analytics grouped by hierarchy and no omitted state. |
| [ ] | **Excellent / Good Progress / Needs Improvement**, relative to platform average. | No platform benchmark or classification rules. |
| [ ] | **Question performance table**: status, ID, subject, chapter, topic, success rate, and time spent. | Question placement and individual correct/incorrect attempts exist, but no per-quiz result table, platform success rate, or time tracking. |
| [-] | **Question details**: student/correct answer, explanation, AI explanation, and video timestamp. | Direct-practice submission provides immediate answer feedback; authoring questions support explanation and optional video timestamp. No post-quiz detail page or AI explanation. [E-LEARN, E-QUESTION] |
| [ ] | **Correct / Incorrect / Omitted indicators**. | Correct/incorrect is stored for direct practice; omitted is not represented and no quiz-review UI exists. |
| [ ] | **Performance overview** circular chart for omitted and incorrect questions. | No completed-quiz result aggregate or omitted state. |
| [ ] | **Subjects performance table**: total, correct, incorrect, and omitted answers per subject. | No per-subject learner analytics endpoint and no omitted state. |
| [ ] | **Expandable subjects**: exams in a subject with detailed results. | No exam/test history or subject drill-down. |
| [ ] | **Chapters/units table and expandable chapters**: chapter statistics, subtopics, and individual exam results. | No chapter-level assessment analytics or exam-history model. |

## Module 4 — Leaderboard

| Status | Original requirement | Current coverage / gap |
| --- | --- | --- |
| [ ] | Weekly honor board of top five, medals/prizes, Friday reset, and rank rewards. | No leaderboard, reward, or scheduled weekly-reset domain. |
| [ ] | Full student ranking table and each student’s exact position. | No platform ranking API. |
| [ ] | Smart Score: `(Accuracy × 60%) + (Total Questions Solved × 40%)`. | No Smart Score calculation or ranking model. |
| [-] | Accuracy: `(Correct Answers / Answered Questions) × 100`. | The basic personal performance endpoint provides accuracy, but not leaderboard usage or ranking. [E-LEARN] |
| [ ] | Ranking columns: rank, student name, quizzes taken, questions solved, accuracy, Smart Score; motivation/competition. | No leaderboard response or related UI. |

## Module 5 — Performance

### Overall and analysis

| Status | Original requirement | Current coverage / gap |
| --- | --- | --- |
| [ ] | Total tests, completed tests, and suspended tests summary. | No generated-test model or status lifecycle. |
| [ ] | QBank usage donut chart and statistics (total/used/unused). | No eligible-bank usage aggregation. |
| [-] | Score section: total correct, incorrect, omitted. | Direct attempts retain correct/incorrect values; omitted and dashboard aggregate are absent. [E-LEARN, E-DATA] |
| [ ] | Answer-change analysis: correct→incorrect and incorrect→correct. | Answers are immutable direct-practice attempts; changes during a test are not recorded. |
| [ ] | Analysis tab by subject, chapter/system, and lesson with correct/incorrect/omitted totals, expandable rows, and search. | No grouped learner analytics or omitted state. |

### Peer ranking and charts

| Status | Original requirement | Current coverage / gap |
| --- | --- | --- |
| [ ] | Percentile/bell-curve peer rank and peer comparison by subject, system, and topic. | No cohort/peer analytics. |
| [ ] | Best/worst subject, category breakdown, category tabs, and search filter. | No peer-ranking or grouped performance data. |
| [ ] | Performance charts by date and test; date/test filters; accuracy trend analysis and progress insight. | No assessment history, per-attempt timing, date-range analytics, or trend endpoints. |

## Roles and permissions

| Status | Original requirement | Current coverage / gap |
| --- | --- | --- |
| [-] | **Admin — user management**: view/search/filter students, parents, and companies; view full profiles. | Admin and partner administration exists, with role-based authentication. No completed admin student/parent directory and full-profile workflow. [E-PARTNER, E-AUTH] |
| [-] | **Admin — student data**: personal data, payments, subscriptions, full performance dashboard. | Orders, entitlements, and basic student performance exist, but no consolidated admin student dashboard. [E-COMMERCE, E-DATA, E-LEARN] |
| [ ] | **Admin — parent management**: list registered parents and linked students. | Parent sessions can list/select linked children for the parent; there is no registered-parent entity or admin parent-management API. |
| [-] | **Admin — companies/partners**: create/edit partner, profit percentage, student count, payments, revenue share. | Admins can create, list, edit, suspend, and reactivate partner accounts. Publisher agreements/earnings models exist, but the requested partner statistics and payment/revenue reporting are not delivered. [E-PARTNER, E-DATA] |
| [-] | **Admin — content management**: CRUD subjects/chapters/lessons, lesson video uploads, PDF uploads to generate questions at all hierarchy levels. | Academic hierarchy CRUD/publishing, video assets, file assets, question banks, and questions are implemented. Automatic PDF-to-question generation is not. [E-HIERARCHY, E-VIDEO, E-QUESTION] |
| [-] | **Admin — pricing and payments**: price each chapter, discount coupons, time-limited subject discounts. | Course/chapter pricing, manual payments, and entitlement fulfilment are implemented. Coupons and timed/subject discounts are not. [E-COMMERCE, E-DATA] |
| [ ] | **Admin — reports**: automatic Excel subscriber export plus payment/revenue reports. | No export/report endpoints. |
| [x] | **Admin access**: dedicated admin login and platform control. | Admin and super-admin login, role guards, and administrative module access are implemented. "Full control" remains limited to delivered modules. [E-AUTH, E-HIERARCHY, E-PARTNER] |
| [x] | **Student registration**: name, phone, grade, governorate, center, National ID. | Student registration/profile stores these fields, with protected National-ID handling and published academic-grade selection. [E-AUTH, E-DATA] |
| [-] | **Student dashboard**: all performance pages, peer ranking, leaderboard, graphs. | Basic direct-practice performance and learning progress exist; the requested dashboard suite does not. [E-LEARN] |
| [-] | **Student learning**: subscribed content, video viewing, and QBank solving. | Entitlement-aware catalogue/content delivery, video access, and direct practice are implemented. The requested quiz/QBank workflows remain missing. [E-CATALOG, E-COMMERCE, E-LEARN, E-VIDEO] |
| [ ] | **Student tests**: timed/tutor tests and previous tests/answers. | No generated assessment, timer, modes, or test history. |
| [-] | **Student progress tracking**: accuracy trends, Smart Score, percentile rank. | Basic accuracy and content progress are implemented; trends, Smart Score, and percentile are not. [E-LEARN] |
| [-] | **Parent registration**: child National ID, parent phone, relationship. | Parent access login uses child National ID and parent phone, then allows child selection. It does not create a separate parent account or store relationship. [E-AUTH, E-DATA] |
| [-] | **Parent monitoring**: child full performance/progress reports. | Selected-child basic performance summary is implemented; full reports are not. [E-LEARN] |
| [ ] | **Parent subscriptions**: child subscribed chapters and payment history. | No parent-scoped entitlements/orders endpoint. |
| [-] | **Parent separate account/access** for follow-up. | A distinct lightweight parent access-session model exists; it is not the requested full parent account/dashboard. [E-AUTH, E-DATA] |
| [x] | **Partner account** created by admin with email/password. | Admin partner creation and partner login are implemented. [E-PARTNER, E-AUTH, E-DATA] |
| [-] | **Partner dashboard**: company, assigned subjects, registered students. | Partner profile and publisher-agreement foundations exist, but no partner dashboard or student-count report. [E-PARTNER, E-DATA] |
| [ ] | **Partner reports/access**: payments, profit share, and network students. | No partner reporting endpoints or referral-network monitoring flow. |

## Original-scope gap summary

The current backend establishes a solid foundation for identity, academic
content administration, protected delivery, completion tracking, direct
practice, manual purchases, and basic role access. To cover the original
scope, the major remaining work is:

1. A persisted assessment domain: quiz generation, standard/custom/AI
   selection, tutor/exam modes, timing, autosave, submission, review, and
   history.
2. Student analytics: QBank usage, omitted/answer-change tracking, grouped
   performance, result comparisons, trends, peer rankings, and Smart Score.
3. Leaderboards, weekly reset/reward rules, and platform-wide aggregates.
4. The learner-facing course experience: continue learning, navigation,
   search, higher-level completion actions, and the PDF’s dashboard views.
5. Missing commercial/admin reporting: discounts/coupons, exports, revenue
   reports, and completed admin/parent/partner dashboards.

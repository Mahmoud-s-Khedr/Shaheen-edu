# Shaheen Edu — Egyptian Launch Readiness Report

**Review date:** 30 July 2026  
**Target launch:** B2C Egyptian Thanaweya students and parents, Grades 10–12  
**Product promise:** Arabic-first exam preparation through lessons, quizzes, timed mocks, question analytics, and adaptive AI-generated training exams.

## Executive verdict

The repository is a well-structured **backend foundation**, but it is **not launch-ready** as an AI-powered exam-preparation LMS. The implemented capabilities are mainly identity, access control, academic content administration, question authoring/review, media protection, and manual entitlements.

The highest-risk gap is that students cannot yet take an exam: there is no learner application, exam assembly, attempt persistence, scoring, result delivery, adaptive learning data, payment checkout, notification service, or analytics product.

The immediate objective should be a focused practice-and-mock-exam launch, not a high-stakes or officially certified examination platform.

## What is already in place

| Area | Current state | Assessment |
| --- | --- | --- |
| Identity and access | Student, parent, admin, partner, session rotation, role protection, rate limiting, encrypted Egyptian national-ID storage | Strong foundation |
| Parent experience | Parent login and child-selection sessions | Useful, but no parent progress product yet |
| Curriculum/content | Grade → subject → course → chapter → lesson → section hierarchy, publishing and ordering | Good authoring backbone |
| Question bank | Sources, banks, single/multiple-choice questions, options, review/publish lifecycle, placements, media links | Good authoring foundation; no learner delivery |
| Monetization access | Course/chapter pricing metadata and manual student entitlements | Incomplete: no checkout, orders, or payment reconciliation |
| Media | Bunny Storage/Stream integration, signed delivery and webhook processing | Good foundation; requires real production acceptance testing |
| Quality | 97 unit tests passed and production build passed during review | Good starting discipline; missing assessment/payment/load/security coverage |

## P0 — required before launch

### 1. Student and parent product

Build a mobile-first Arabic RTL web application with:

- Registration/login, grade selection, catalogue and purchased-content access.
- Lesson viewing, quiz/mocks discovery, countdown timer, autosave, resume, submission, results, explanations, and retry flows.
- Student dashboard showing current progress, weak topics, recommended next activity, and recent results.
- Parent dashboard showing selected child’s activity, mock results, weak topics, and reminders.
- Arabic-first interface, low-bandwidth behavior, accessible keyboard/focus states, and clear error/recovery states.

### 2. Exam, attempt, and scoring engine

Add a separate assessment domain. It must support:

- Practice sets, topic quizzes, timed quizzes, and full timed mock exams.
- Exam templates/blueprints, question ordering, time limits, availability, attempts, autosave, expiry, and submission idempotency.
- Immutable question and answer-key snapshots attached to each exam attempt, so question edits cannot change historic results.
- Correct scoring for single-choice and multiple-choice questions, unanswered questions, result explanations, and result history.
- Strong authorization: correct answers must never be sent to the student before submission; a student can access only their own attempts.

### 3. Versioned curriculum and question quality

Add curriculum-year versions for each Thanaweya grade, with an Arabic learning-objective tree under subjects/units/lessons. Every published question should be mapped to one or more objectives and include:

- Curriculum version, grade, subject, lesson placement, difficulty, and estimated duration.
- Source, copyright/licence evidence, reviewer, review date, and question revision history.
- Clear publication checks that prevent a question without an objective, valid options, explanation, or rights clearance from entering an exam.

This is essential for annual curriculum change management and for making analytics/adaptive exams trustworthy.

### 4. Analytics and adaptive exam generation

Collect scoring and engagement events, then provide:

- Student mastery per learning objective: accuracy, answered count, recent trend, time per question, and repeated errors.
- Question analytics for staff: exposure, accuracy, skipped rate, average time, difficulty, and a later discrimination-quality measure.
- Cohort/grade/subject reporting for product and content teams.
- An adaptive exam builder that identifies low-mastery objectives and assembles a balanced training exam from **reviewed, published questions**.

For v1, “AI-generated exam” should mean an AI-guided personalized assembly of trusted questions—not autonomous creation of live question content. This protects quality, curriculum alignment, and answer correctness.

### 5. Payments and entitlements

Implement the full commerce path:

- Egyptian-pound prices, checkout, payment-provider redirect/hosted flow, signed webhook verification, idempotency, payment status, refund/cancellation handling, invoice/receipt references, and reconciliation.
- Immutable order/payment/refund records; payment success grants the entitlement exactly once.
- Failed-payment recovery, support lookup, and a manual correction/audit workflow.

Use a licensed Egyptian payment service provider rather than handling card data or operating payment services directly. The Central Bank of Egypt oversees payment systems and providers, including providers serving Egyptian residents: [CBE payment oversight](https://www.cbe.org.eg/en/payment-systems-and-services/payment-systems-and-services-oversight).

### 6. Legal, privacy, and trust

Before launch, obtain Egyptian legal review and publish Arabic terms. Required work includes:

- Privacy notice, terms of use, refund/cancellation policy, and support escalation policy.
- Parental consent/control model appropriate for minors and a record of consent changes.
- Data-access, correction, deletion, and retention workflows; minimise use of national-ID data.
- Copyright and licensing register for publisher content, external books, past papers, ministry models, videos, and AI training/retrieval material.
- AI disclosure, feedback/reporting control, prohibition on harmful/unsupported advice, and human escalation.

The Ministry maintains educational platforms and publishes secondary-school digital resources/sample exams; content operations must therefore have a named curriculum owner and a release process for yearly changes: [Ministry of Education](https://moe.gov.eg/en/).

## P1 — required for a reliable early launch

- Notifications for purchases, exam reminders, results, security events, and parent summaries, with explicit opt-in and delivery audit status.
- Admin dashboards for question quality, content readiness, purchases, active learners, completion, retention, and support issues.
- Bulk question/content import with validation and a staged review queue.
- Search/filtering by grade, subject, chapter, objective, source, difficulty, and question status.
- Support tooling: account lookup, entitlement correction, attempt investigation, payment lookup, and student issue audit trail.
- Operational jobs for expired attempts, stale uploads/webhook retention, payment reconciliation, backups, and scheduled reporting.

## P2 — defer until after evidence from launch

- Remote proctoring, identity checks during an exam, anti-cheat monitoring, certificates, or any claim of official examination equivalence.
- IRT/adaptive-calibration models before sufficient real-response volume is available.
- AI-authored questions published without mandatory human review.
- School/B2B rostering, teacher assignment workflows, and class administration.
- Native mobile apps; the responsive web product should establish demand first.

## Technical and operational gaps

- No frontend project exists in this repository.
- No assessment/attempt/scoring data model or API exists in the current application.
- No payment provider, order ledger, checkout, payment webhook, reconciliation, or refund process exists.
- No AI provider integration, model policy, retrieval corpus, prompt/output audit log, safety evaluation, or cost monitoring exists.
- No notification provider or preference/consent system exists.
- No observability stack is present for product metrics, errors, latency, queue failures, or provider health.
- No visible CI workflow, backup/restore drill, production deployment runbook, load test, or disaster-recovery evidence was found.
- Media integration requires production configuration and an end-to-end Bunny upload/webhook/playback acceptance run.

## Recommended launch sequence

1. **Foundation:** curriculum versions/objectives, learner APIs, exam/attempt/scoring schema, and assessment authorization tests.
2. **Student value:** Arabic RTL learner web app, practice/mocks, result explanations, parent progress, and basic dashboards.
3. **Revenue and reliability:** licensed PSP checkout, entitlement automation, notifications, operations monitoring, backup/restore, and support tools.
4. **Adaptive value:** objective mastery, adaptive exam assembly from approved questions, AI tutor explanations/hints, and a measured safety/cost evaluation.
5. **Launch gate:** real-provider acceptance tests, mobile/low-bandwidth UAT, accessibility review, security review, legal approval, content-rights signoff, and peak mock-exam load test.

## Minimum launch metrics

Define these before building dashboards:

- Registration-to-first-attempt conversion.
- First completed quiz/mock within 24 hours of registration.
- Quiz and mock completion rate.
- Weekly active learners and retention by grade/subject.
- Mastery improvement by objective after repeat practice.
- Payment success, refund, entitlement fulfilment, and support-contact rates.
- Question quality: exposure, accuracy, time, skip rate, and flagged-question rate.
- AI recommendation acceptance, unsafe-output reports, curriculum-alignment review pass rate, latency, and cost per active learner.

## Review limits

This is a repository review, not a legal, security-penetration, production-load, or UX audit. There is no learner-facing frontend to inspect visually, no configured production payment provider, and no real production data from which to validate question analytics or adaptive-model quality.

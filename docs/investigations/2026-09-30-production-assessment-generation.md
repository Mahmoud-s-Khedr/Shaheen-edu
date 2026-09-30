# Production assessment-generation investigation — 2026-09-30

## Status

Investigation complete; no code changes have been made. This report is a
handoff for the agent implementing and verifying the fixes.

## Environment and evidence

- Production Compose project: `shaheen-edu-production`.
- API release observed in structured logs: `984cd6b`.
- At the time of collection, API and worker containers were healthy.
- Compose logs were exported from the VPS for the preceding 18 hours to
  `deploy/production/logs-20260930T144303Z/`. The combined export was 8.5 MB.
- Do not restart Docker or reboot as part of this issue. A kernel upgrade is
  pending, but it is unrelated to these defects.

All times below are UTC.

## Executive summary

There are two separate assessment-creation defects:

1. **Standard assessment creation is blocked by an obsolete frontend request
   field.** The frontend sends `questionBankId`, while the current API DTO
   accepts only `questionBankIds` (an array).
2. **AI-prompt assessment creation can fail even with sufficient valid
   questions.** The model returned an invalid selection and the API correctly
   rejected it. However, the application discards the model response on this
   failure, preventing diagnosis and reliable remediation.

There are also two operational follow-ups:

- Error logging records conflicting `200` request-completion metadata alongside
  actual `400` errors, which is misleading for monitoring.
- The public API receives broad automated probing traffic. The observed probes
  were rejected, but they create avoidable log noise and should be rate-limited
  at the public edge.

## Finding 1 — obsolete `questionBankId` blocks standard creation

### Severity

High: it blocks normal assessment creation in the production UI.

### Reproduction evidence

The browser sent:

```http
POST https://api.jibal-platform.com/api/v1/student/assessments
```

```json
{
  "questionBankId": "cmugzhf5l00j2qj01q7hqinqa",
  "courseIds": ["cmuiol725000bqr01yn3yb90v"],
  "questionCount": 20,
  "mode": "TUTOR",
  "isTimed": false
}
```

The API returned:

```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST.VALIDATION_FAILED",
  "message": {
    "en": "property questionBankId should not exist",
    "ar": "هذا الحقل غير مسموح به. احذفه من الطلب"
  },
  "details": [
    {
      "field": "questionBankId",
      "code": "VALIDATION.WHITELISTVALIDATION"
    }
  ]
}
```

This corresponds to repeated `POST /api/v1/student/assessments` validation
failures in API logs from 14:29 through 14:34.

### Root cause

`GenerateStudentAssessmentDto` defines `questionBankIds?: string[]`; it does
not define `questionBankId`. The API uses whitelist validation, so the singular
field is intentionally rejected.

Relevant code:

- `src/modules/assessments/dto/assessments.dto.ts` —
  `GenerateStudentAssessmentDto`
- `src/modules/assessments/assessments.service.ts` — `generateStandard`

### Required frontend fix

Send the plural array field, including when exactly one bank is selected:

```json
{
  "questionBankIds": ["cmugzhf5l00j2qj01q7hqinqa"],
  "courseIds": ["cmuiol725000bqr01yn3yb90v"],
  "questionCount": 20,
  "mode": "TUTOR",
  "isTimed": false
}
```

Do **not** change the backend DTO merely to accept the old singular form unless
backward compatibility for an independently deployed client is explicitly
required. The canonical contract is the plural array.

## Finding 2 — AI-prompt selection fails despite enough eligible questions

### Severity

High: AI assessment generation is non-functional for this valid student
request.

### Reproduction evidence

The browser sent:

```http
POST https://api.jibal-platform.com/api/v1/student/assessments/ai-prompt
```

```json
{
  "questionCount": 20,
  "mode": "TUTOR",
  "isTimed": false,
  "prompt": "عاوز امتحان",
  "scopes": [{ "courseId": "cmuiol725000bqr01yn3yb90v" }]
}
```

The API returned:

```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST.AI_RETURNED_AN_INVALID_QUIZ_SELECTION",
  "message": {
    "en": "AI returned an invalid quiz selection",
    "ar": "أعاد الذكاء الاصطناعي تحديد اختبار غير صالح"
  },
  "correlationId": "aee49995-8c91-4068-85b3-9fbea8309bfd"
}
```

An earlier failed `AiQuizGenerationRun` from 14:35:51 confirms that a similar
request for the same course requested 20 questions and had **25 eligible
question IDs**. It therefore did not fail because the scope lacked questions.
Its prompt was `انشأ اختبار شامل على مادة اللغة العربية` and its mode was
`TUTOR`.

### Current endpoint behavior

The endpoint:

1. Requires an authenticated `STUDENT` user.
2. Validates `prompt` (3–2,000 chars), `questionCount` (1–50), settings, and
   a non-empty `scopes` array.
3. Resolves scopes. Each scope object must contain exactly one of `courseId`,
   `chapterId`, `lessonId`, or `sectionId`.
4. Finds eligible questions that are published, belong to the student's
   published grade content, sit under published placement ancestry, and are
   covered by the student's entitlement.
5. Builds up to 250 AI candidates containing the question ID, truncated body,
   content placement names, and the student's personal state (`MARKED`,
   `UNUSED`, `CORRECT`, or `INCORRECT`). It does not send answer options or
   correct answers.
6. Asks OpenRouter for a JSON object containing `rationale` and
   `questionIds`.
7. Requires the returned IDs to be an array with exactly `questionCount`
   unique values, every one of which is in the eligible set.
8. If valid, creates an immutable private assessment snapshot and returns it.

Relevant code:

- `src/modules/assessments/assessments.controller.ts` — `aiPrompt`
- `src/modules/assessments/assessments.service.ts` — `generateAiPrompt`,
  `resolveScopes`, and `eligibleQuestions`
- `src/modules/assessments/assessment-ai.client.ts` — `planQuiz`

### Root cause

The API validation found that the model output was one or more of:

- not an array of IDs;
- not exactly 20 IDs;
- duplicated IDs; or
- IDs absent from the eligible-question list.

The request itself, its scope, and the available question count are valid.

The exact malformed model response cannot be recovered from the existing run:

```text
rawResponse: null
model: null
usage: null
error: AI returned an invalid quiz selection
```

This is a backend observability defect. `generateAiPrompt` stores `rawResponse`,
`model`, and `usage` only in its success path. Its catch path stores only the
error message.

### Important contract distinction

`POST /student/assessments/ai-prompt` accepts **`scopes` only**. It does not
accept `questionBankId`, `questionBankIds`, source IDs, or source-type filters.
It chooses among all eligible questions within the supplied scope. This is
different from `POST /student/assessments`, which uses `questionBankIds` and
the `courseIds`/`chapterIds`/`lessonIds`/`sectionIds` fields.

## Required remediation plan

### 1. Deploy the frontend standard-request fix

- Replace `questionBankId: selectedBankId` with
  `questionBankIds: selectedBankIds`.
- Ensure a single selected bank is still serialized as a one-item array.
- Add a frontend request-contract test or a browser-level test asserting that
  the standard endpoint never receives the singular property.

### 2. Preserve AI failure evidence in the API

Refactor `generateAiPrompt` so the response is retained in a variable before
the semantic ID validation. On any failure after the OpenRouter response has
been received, update `AiQuizGenerationRun` with:

- `model`
- `usage`
- `rawResponse` (consider a bounded/redacted representation if response size
  is a concern)
- parsed `questionIds`, if available
- the failure reason and completion time

Do not log API keys, authorization headers, or full student tokens.

### 3. Make AI output structurally constrained

The current request uses OpenRouter's generic `json_object` response format,
then relies on a natural-language instruction to request valid IDs. Strengthen
the integration so the provider/model is constrained to return:

- `questionIds` as an array;
- exactly `questionCount` items;
- unique items; and
- only IDs from the dynamic eligible-ID set.

Confirm the selected OpenRouter model/provider's supported structured-output
capabilities before choosing the exact request format. Keep the server-side
validation regardless of provider-side constraints.

### 4. Decide retry semantics explicitly

An invalid AI selection is not a client validation error. After diagnostic
persistence and structured output are in place, choose one of these product
behaviors:

- **Recommended:** one bounded repair/retry attempt, then return a `503`
  service-unavailable-style response if it remains invalid.
- **Alternative:** no retry, but return a `5xx` response and a useful localized
  temporary-service message.

Do not silently fill missing IDs randomly: that would violate the user's AI
prompt intent. Do not introduce automatic retries without an agreed cost and
latency limit.

### 5. Correct error semantics and metrics

`AI_RETURNED_AN_INVALID_QUIZ_SELECTION` currently returns `400`, even though
the client payload has passed validation. Consider mapping persistent model
contract failures to a `5xx`/`503` category while preserving a distinct,
non-sensitive application code.

Also investigate API log entries where outer request-completion data shows
`statusCode: 200` alongside a nested `http_client_error` with `400` or `404`.
This can corrupt dashboards and make client-error rates appear healthy.

## Verification plan

### Standard generation

1. Log in as the affected student.
2. Select the same bank and course.
3. Verify browser Network payload uses `questionBankIds: [id]` and has no
   `questionBankId` property.
4. Submit 20 questions in tutor mode.
5. Expect HTTP `201`, an assessment with 20 frozen questions, and no
   `VALIDATION.WHITELISTVALIDATION` error.

### AI-prompt generation

Automated tests should cover:

- a valid 20-ID model response creates an assessment;
- too few IDs;
- too many IDs;
- duplicate IDs;
- an ID outside the eligible set;
- malformed JSON/provider failure.

For every invalid-response case, assert that `AiQuizGenerationRun` is marked
failed **and** preserves safe diagnostic model response data.

After deployment, issue the same valid AI request for the course. Expect HTTP
`201`, 20 assessment questions, and a completed AI run. If it fails, use the
saved run data to identify the returned ID-list defect before changing model
or prompt settings.

## Security/operations follow-up

The 18-hour API log contains broad automated probes for `.env`, Git files,
PHPUnit, VPN endpoints, device APIs, and similar paths. The shown requests
were rejected with `404`; there is no evidence in this export of a successful
secret or file exposure.

Schedule a separate edge-hardening change:

- inspect host-Nginx access logs for source IP and request rate;
- add sensible Nginx rate limits for unauthenticated API traffic;
- use a WAF/CDN rule set if available;
- reduce expected unmatched-route scanner logs from high-volume application
  events without hiding actionable authentication or application failures.

This work must not be bundled with the assessment behavior changes.

## Handoff checklist

- [ ] Locate and patch the frontend serializer for standard assessment creation.
- [ ] Add/update frontend contract coverage for `questionBankIds`.
- [ ] Refactor AI-run failure persistence in `generateAiPrompt`.
- [ ] Add model-output constraint/validation tests.
- [ ] Decide and implement bounded retry/error-status behavior.
- [ ] Run relevant unit/e2e tests and deploy through the normal production
      process.
- [ ] Perform the two production verification scenarios above.
- [ ] Open a separate ticket/change for Nginx/WAF rate limiting and log-noise
      reduction.

# Internal forms API

Base URL: `/api/v1`. All routes require bearer authentication. No anonymous forms, duplication endpoint, submission editing, or reopening closed forms.

## Permissions and lifecycle

Only `SUPER_ADMIN` can manage forms or read other respondents' submissions and results. Students use their normal access token. Parents use their existing parent access token; no selected child is required. Other user roles cannot respond.

Both students and parents see the same active form. Each student can submit once per form. Each normalized parent phone can submit once per form, across sessions and linked children. Parent and student responses are independent. A phone number is the current parent identity; this is not one response per child or login session.

Forms move from `DRAFT` to `ACTIVE` to `CLOSED`. At most one form is active globally. Activating a draft automatically closes the previous active form atomically. Activating an already-active form and closing an already-closed form are idempotent. Drafts cannot be closed and closed forms cannot be reactivated. Only drafts can be edited or deleted. Published questions/options remain immutable to preserve answer meaning. Existing responses remain readable after closure.

## Super-admin endpoints

| Method | Path                                         | Response                                                                        |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------- |
| POST   | `/admin/forms`                               | Complete created draft                                                          |
| GET    | `/admin/forms`                               | Paginated forms with `submissionCount`; optional `status=DRAFT\|ACTIVE\|CLOSED` |
| GET    | `/admin/forms/:id`                           | Complete form with ordered questions/options                                    |
| PATCH  | `/admin/forms/:id`                           | Complete updated draft                                                          |
| DELETE | `/admin/forms/:id`                           | `{ "id": "...", "deleted": true }`                                              |
| POST   | `/admin/forms/:id/activate`                  | Complete active form; closes previous active form                               |
| POST   | `/admin/forms/:id/close`                     | Complete closed form                                                            |
| GET    | `/admin/forms/:id/submissions`               | Paginated submissions; optional `respondentType=STUDENT\|PARENT`                |
| GET    | `/admin/forms/:id/submissions/:submissionId` | Complete submission with answers                                                |
| GET    | `/admin/forms/:id/results`                   | Totals and question statistics; optional `respondentType=STUDENT\|PARENT`       |

Collection pagination uses `page` (default 1) and `limit` (default 20, maximum 100). The response is `{ data: [...], meta: { page, limit, total, totalPages } }`. Forms are newest first; submissions are latest first, with ID tie-breaking.

Submission list items include `id`, `formId`, `respondentType`, `studentUserId`, `parentPhoneNormalized`, `submittedAt`, and `studentName`. Only the matching respondent identity is populated. Full submissions contain `answers` with `questionId`, `text` (nullable), and `optionIds`.

### Create a draft

```json
{
  "title": "Platform feedback",
  "description": "Tell us what you think.",
  "confirmationMessage": "Thank you!",
  "questions": [
    { "title": "Comments", "type": "TEXT", "required": false },
    {
      "title": "Experience",
      "type": "SINGLE_CHOICE",
      "required": true,
      "options": [{ "label": "Good" }, { "label": "Average" }]
    },
    {
      "title": "Subjects you want more of",
      "type": "MULTIPLE_CHOICE",
      "required": true,
      "options": [{ "label": "Physics" }, { "label": "Chemistry" }]
    }
  ]
}
```

The API generates IDs. Question and option array order determines display order; responses include one-based `sortOrder` values.

A form has 1–100 questions. Choice questions require 2–50 options; text questions cannot have options. `required` defaults to `false`. Limits: title 200 characters, description 5,000, confirmation message 1,000, question title 2,000, option label 500, and text answers 10,000. Text is trimmed; titles and labels must be nonblank. Description and confirmation message may be cleared with `null`.

### Edit a draft

`PATCH` accepts any subset of `title`, `description`, `confirmationMessage`, and `questions`. If `questions` is supplied, it replaces the entire question list. Omitted questions/options are removed. Include existing question/option `id` values to retain them; omit IDs for new entries. Existing option IDs must belong to their question and existing question IDs must belong to the draft. IDs must not be repeated.

Send only input fields: question `id`, `title`, `type`, `required`, and `options`; option `id` and `label`. Do not send response-only `formId`, `questionId`, or `sortOrder` fields back. Include `required` for retained questions; omitted values default to false. Omitting the whole `questions` field preserves the existing list.

### Results

```json
{
  "formId": "form-id",
  "respondentType": null,
  "totalSubmissions": 2,
  "questions": [
    {
      "id": "question-id",
      "title": "Subjects you want more of",
      "type": "MULTIPLE_CHOICE",
      "answerCount": 2,
      "options": [
        {
          "id": "physics-id",
          "label": "Physics",
          "count": 2,
          "percentage": 100
        },
        {
          "id": "chemistry-id",
          "label": "Chemistry",
          "count": 1,
          "percentage": 50
        }
      ]
    }
  ]
}
```

Each percentage uses respondents who answered that question, rather than all submissions. Values are rounded to two decimal places. Multi-select percentages may sum above 100. Zero answers produces zero percentages. Text questions have an answer count and an empty options array; read text answers through paginated submissions and submission details. Results filters apply to both counts and percentages.

## Student and parent endpoints

Use `/student/forms` or `/parent/forms` according to the logged-in session.

| Method | Relative path      | Purpose                                             |
| ------ | ------------------ | --------------------------------------------------- |
| GET    | `/active`          | Get active content and own submission status        |
| POST   | `/:id/submissions` | Save one final submission                           |
| GET    | `/:id/submission`  | Read own submitted answers, including after closure |

### Active form

```json
{
  "form": {
    "id": "form-id",
    "title": "Platform feedback",
    "description": "Tell us what you think.",
    "confirmationMessage": "Thank you!",
    "questions": []
  },
  "hasSubmitted": false,
  "submissionId": null
}
```

`questions` contains the ordered questions and options described above. Staff IDs and other people's submissions are not exposed. When nothing is active: `{ "form": null, "hasSubmitted": false, "submissionId": null }`.

Suggested frontend behavior: show a non-blocking dashboard banner when `form` exists and `hasSubmitted` is false. Render radio buttons for single choice, checkboxes for multiple choice, and a text area for text questions. Hide the invitation after submission.

### Submit

```json
{
  "answers": [
    { "questionId": "text-question-id", "text": "More revision lessons." },
    { "questionId": "single-question-id", "optionIds": ["good-option-id"] },
    {
      "questionId": "multiple-question-id",
      "optionIds": ["physics-id", "chemistry-id"]
    }
  ]
}
```

Single choice requires exactly one ID. Multiple choice requires at least one distinct ID. IDs must belong to the answered question and form. Text questions accept only nonblank text; choice questions accept only `optionIds`. Omit unanswered optional questions entirely. An empty `answers` array is allowed only when every question is optional. All answers are validated and saved atomically. Respondent identity comes from authentication; clients cannot submit on behalf of another person.

Success returns HTTP 201 with the submission ID, respondent identity, submission time, stored answers, and `confirmationMessage` (nullable; use a frontend default when null). GET own submission returns the same stored submission without `confirmationMessage`.

### Errors

Errors use the existing global API error envelope.

- `400`: invalid input, missing required answers, duplicate questions/options, or foreign question/option IDs.
- `401`: missing, expired, revoked, or wrong-kind access token.
- `403`: authenticated user has the wrong role.
- `404`: unknown form, submission, or no own submission. Reading another person's submission through the own-submission endpoint returns 404.
- `409`: form is not accepting submissions, respondent already submitted, or lifecycle operation is invalid.

If a form closes or is replaced while the user is answering, submission returns 409; explain that responses are closed and refresh the active form. Concurrent duplicate submissions produce one success and one 409. Forms and submissions cannot be edited after activation/submission.

## Deployment and verification

Apply migration `20261023120000_internal_forms` through the existing migration deployment workflow and regenerate Prisma Client during the build. The additive migration creates survey tables, respondent uniqueness constraints, an identity check constraint, and a partial unique index enforcing one active form. The new endpoints are documented in Swagger. No existing forms or responses require migration.

Run `pnpm test:e2e -- forms.e2e-spec.ts` for permissions, lifecycle, validation, parent identity, summaries, and concurrency coverage against disposable PostgreSQL/Redis containers.

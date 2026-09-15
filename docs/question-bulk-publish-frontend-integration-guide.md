# Bulk Question Publish: Frontend Integration Guide

This guide covers the admin workflow for publishing multiple questions in one
request. It is intended for question-authoring screens and moderation queues.

## Endpoint

```http
POST /api/v1/admin/questions/bulk-publish
Authorization: Bearer <access-token>
Content-Type: application/json
```

Only `ADMIN` and `SUPER_ADMIN` users can call this endpoint.

## Request

Send between 1 and 300 unique question IDs.

```json
{
  "questionIds": ["question_123", "question_456"]
}
```

The frontend should remove duplicate IDs before sending and should not offer a
bulk-publish action when no questions are selected.

## Eligible questions

Bulk publishing accepts questions in these states:

- `DRAFT`
- `REJECTED`
- `IN_REVIEW`

Each question must still satisfy all normal publication requirements, including
published source, bank, and course ancestry; valid answer data; placements; and
ready, compatible assets.

The existing single-question publish endpoint is unchanged: it still accepts
only `IN_REVIEW` questions.

## Response and partial success

The endpoint returns `201 Created` after processing every submitted ID. A `201`
does not mean every item was published. Always inspect both response arrays.

```json
{
  "publishedIds": ["question_123"],
  "failed": [
    {
      "id": "question_456",
      "reason": "Question options do not satisfy its answer type"
    }
  ]
}
```

`publishedIds` contains only questions whose publication transaction committed.
`failed` contains one entry for each ID that could not be published; a failure
for one question does not stop the remaining selected questions.

## Recommended UI flow

1. Allow selecting eligible-looking rows from the question list.
2. Show a confirmation dialog with the number selected and a reminder that
   every question will be validated before publication.
3. Disable the submit button while the request is in flight, but retain the
   original selection locally.
4. On `201`, remove `publishedIds` from the selection and refresh the affected
   list or rows.
5. Show a success toast with the published count.
6. Show a failure panel with the failed question IDs, their current titles when
   available, and each `reason`. Keep failed IDs selected so an admin can fix
   them or retry as appropriate.

For example, a request with 12 selected IDs might show: “10 questions
published; 2 need attention.” Do not present this as a wholly failed operation.

## Retry guidance

Some failures require an edit before retrying, such as missing answer options or
an unpublished source. Display the supplied reason next to the affected item.

If the reason is:

```text
Question changed while it was being published; refresh and retry
```

the question was modified concurrently. Refresh that question or the queue
before allowing a retry, so the admin sees its latest state and validation
results.

For this safe fallback:

```text
Unable to publish question
```

show a generic retry action and report the request/correlation ID to support if
the problem persists. Do not assume the underlying infrastructure error is safe
to display to an end user.

Questions already in `PUBLISHED` or `ARCHIVED` state cannot be bulk-published.
Refresh the list before a retry to prevent repeatedly submitting those IDs.

## TypeScript example

```ts
type BulkPublishFailure = {
  id: string;
  reason: string;
};

type BulkPublishResponse = {
  publishedIds: string[];
  failed: BulkPublishFailure[];
};

export async function bulkPublishQuestions(
  token: string,
  questionIds: string[],
): Promise<BulkPublishResponse> {
  const uniqueIds = [...new Set(questionIds)];

  if (uniqueIds.length === 0 || uniqueIds.length > 300) {
    throw new Error('Select between 1 and 300 unique questions.');
  }

  const response = await fetch('/api/v1/admin/questions/bulk-publish', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ questionIds: uniqueIds }),
  });

  if (!response.ok) {
    // Handle authentication, authorization, and malformed-request errors at
    // the application level. A partial result is always a 201 response.
    throw new Error(`Bulk publish request failed (${response.status})`);
  }

  return (await response.json()) as BulkPublishResponse;
}
```

## Non-item request failures

These errors apply to the entire request, so there is no per-question result:

| Status | Meaning | Frontend behavior |
| --- | --- | --- |
| `400` | The request body is invalid, such as an empty, duplicate, or over-300 ID list. | Keep the selection and correct the client request. |
| `401` | The session is missing or expired. | Start the normal sign-in or token-refresh flow. |
| `403` | The signed-in user is not an admin. | Remove the action and show the standard permission message. |
| `5xx` | The request could not be completed as an API request. | Keep the selection and offer a later retry. |

Use the normal question-list refresh mechanism after a completed request rather
than locally forcing statuses to `PUBLISHED`; the refresh also accounts for
server-side validation, concurrent edits, and replacement-question archival.

# Student Activity, Device Sessions, and Video Feedback: Frontend Integration Guide

This guide covers the parent daily learning-activity card, one-device student
sessions, admin session resets, and video-feedback moderation.

All paths below include the versioned API prefix. The generated API reference
is also available at `/api/docs`.

## Foundation

Use the API origin from configuration and send a bearer token for every
authenticated request:

```http
Authorization: Bearer <accessToken>
Accept: application/json
```

For example, configure the shared client with the API version once, then use
the shorter paths shown in the TypeScript examples:

```ts
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_ORIGIN}/api/v1`,
  withCredentials: true,
});
```

Browser clients must enable credentials so the HttpOnly `refresh_token` cookie
is sent to the existing refresh endpoint. Keep the access token in memory.
On one `401`, run the normal one-time refresh-and-retry flow; if refresh fails,
clear the local session and take the user to login. Do not retry a failed
refresh request or repeatedly retry a `409`.

Errors use this envelope (with optional `details`):

```json
{
  "statusCode": 409,
  "code": "STUDENT_DEVICE_ALREADY_ACTIVE",
  "message": { "ar": "...", "en": "..." },
  "error": { "ar": "...", "en": "..." },
  "correlationId": "..."
}
```

Display the localized `message` for the active UI language. For validation
errors, place every `details[].message` next to the matching field, and retain
`correlationId` in client logs or support reports. Request fields not described
here are rejected.

## At a glance

| Feature                               | Endpoint                                                     | Identity                    |
| ------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| Daily activity                        | `GET /api/v1/parent/selected-child/analytics/daily-activity` | Parent selected-child token |
| Reset a student device session        | `POST /api/v1/admin/students/:id/reset-session`              | `ADMIN` or `SUPER_ADMIN`    |
| Submit/update personal video feedback | `POST /api/v1/student/video-assets/:videoAssetId/feedback`   | `STUDENT`                   |
| Review video feedback                 | `GET /api/v1/admin/video-feedback`                           | `ADMIN` or `SUPER_ADMIN`    |
| Delete junk video feedback            | `DELETE /api/v1/admin/video-feedback/:id`                    | `ADMIN` or `SUPER_ADMIN`    |

## 1. Parent daily learning activity

The parent must first log in, select one of their linked children with
`POST /api/v1/auth/parents/select-child`, then use that parent access token.
The selected child is stored in the parent session; this endpoint accepts no
student ID and cannot be used to inspect an arbitrary student.

```http
GET /api/v1/parent/selected-child/analytics/daily-activity?from=2026-09-01&to=2026-09-07
Authorization: Bearer <parent-access-token-with-selected-child>
```

Both parameters are required inclusive calendar dates in exact `YYYY-MM-DD`
form. Dates, grouping, and range boundaries use `Africa/Cairo`, not the
browser's local timezone. `from` must be on or before `to`.

```json
{
  "days": [
    {
      "date": "2026-09-01",
      "solvedQuestions": 4,
      "contentDurationSeconds": 1500
    },
    {
      "date": "2026-09-02",
      "solvedQuestions": 0,
      "contentDurationSeconds": 0
    }
  ]
}
```

`days` is ordered from `from` through `to`, with a row for every date even
when there was no activity. `solvedQuestions` is the number of distinct
questions answered correctly that Cairo day: correct retries of the same
question count once. `contentDurationSeconds` is the sum of each completed
content item's `estimatedDuration`; an item with no estimated duration adds
zero seconds.

Recommended UI behavior:

- Construct the range as Cairo calendar dates; do not derive the date strings
  from `Date.prototype.toISOString()`, which can shift a date around midnight.
- Render all returned rows directly in a streak, bar, or heat-map component.
  Do not infer missing dates or treat zeros as an error.
- Format duration for display (for example, `1500` as `25 min`), while keeping
  the API value in seconds for calculations.
- A reversed or malformed range receives `400`; keep the selected range and
  offer a field-level correction instead of clearing the card.

```ts
type DailyActivity = {
  days: Array<{
    date: string; // Cairo YYYY-MM-DD
    solvedQuestions: number;
    contentDurationSeconds: number;
  }>;
};

async function getDailyActivity(from: string, to: string) {
  const query = new URLSearchParams({ from, to });
  return api.get<DailyActivity>(
    `/parent/selected-child/analytics/daily-activity?${query}`,
  );
}
```

## 2. One active student device session

`POST /api/v1/auth/students/login` now allows one active session per student.
The successful response remains unchanged: it returns `201 Created`, an
`accessToken`, and an HttpOnly `refresh_token` cookie.

If another unexpired student session is active, login returns `409 Conflict`:

```json
{
  "statusCode": 409,
  "code": "STUDENT_DEVICE_ALREADY_ACTIVE",
  "message": {
    "ar": "...",
    "en": "A student device session is already active"
  },
  "error": { "ar": "...", "en": "Conflict" },
  "correlationId": "..."
}
```

Treat this as a blocked login, not invalid credentials and not a transient
network error. Show a clear screen/message such as: “This account is active on
another device. Log out there, or ask an administrator to reset the session.”
Keep the entered phone number, but never keep or redisplay the password.

Do not implement a client-side “force login” request. The student can end the
current device session with the existing `POST /api/v1/auth/logout` endpoint,
or an administrator can reset it as described next. Concurrent login attempts
can produce one `201` and one `409`; handle each response independently.

## 3. Admin reset of a student's device session

```http
POST /api/v1/admin/students/student_123/reset-session
Authorization: Bearer <admin-access-token>
```

There is no body. The student ID is the user/student ID already used by the
admin student list and detail screens, not a phone number or profile ID.

Successful response (`200 OK`):

```json
{
  "studentId": "student_123",
  "revokedSessionCount": 1
}
```

`revokedSessionCount` may be `0`; that is still a successful, idempotent reset
and means there was no active refresh session to revoke. A reset immediately
invalidates the revoked student's bearer session as well as their refresh
token, freeing the login slot. It does not sign the admin out.

Recommended admin flow:

1. Put **Reset device session** on a student detail row or an explicit support
   action, not on an unguarded bulk list action.
2. Confirm the student identity and explain that their current device will be
   signed out.
3. Disable the action while the request is pending.
4. On `200`, show whether a session was revoked using `revokedSessionCount`.
   The student may log in again immediately.
5. On `401` or `403`, follow the normal admin session/permissions handling;
   on `404`, refresh the student list because the supplied ID is not a student.

## 4. Student video feedback

```http
POST /api/v1/student/video-assets/video_asset_123/feedback
Authorization: Bearer <student-access-token>
Content-Type: application/json

{
  "rating": 5,
  "comment": "The examples made this lesson much clearer."
}
```

`rating` is an optional integer from `1` through `5`. `comment` is optional
text from 1 through 4,000 characters; leading and trailing whitespace is
removed by the API. Provide at least one of them. This is an upsert: a student
has one feedback record per video, and a later request replaces both fields;
an omitted field is stored as `null`.

The endpoint returns `201 Created` for both creation and update:

```json
{
  "id": "feedback_123",
  "videoAssetId": "video_asset_123",
  "studentUserId": "student_123",
  "contentItemId": "content_item_123",
  "rating": 5,
  "comment": "The examples made this lesson much clearer.",
  "createdAt": "2026-09-17T10:30:00.000Z",
  "updatedAt": "2026-09-17T10:30:00.000Z"
}
```

The response timestamps are ISO date-times. On an update, `createdAt` remains
the original creation time and `updatedAt` changes.

### When to show the form

Only offer feedback once the learner can play a video. Server-side, submission
also requires all of the following:

- The supplied ID is the application `videoAssetId` (not Bunny's `videoId`).
- The video asset and its processing state are both `READY`.
- It is the primary asset of a currently `PUBLISHED` content item.
- The authenticated student is entitled to that published item.

The form should be available from the student video player using the video's
primary asset ID. It is not a general feedback form for attachments, a
processing video, an unpublished item, or an inaccessible video. The server
remains authoritative, so always handle errors even when the player was
previously available.

| Result | Typical meaning                                        | UI response                                                                                                                     |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `201`  | Feedback was created or replaced.                      | Close/reset the form and show a success state. Store the returned feedback if the current screen needs it.                      |
| `400`  | Both feedback fields are missing, or a supplied field is invalid. | Show `details` at the rating/comment controls; do not discard the draft.                                                        |
| `401`  | Student session is invalid.                            | Run the normal single refresh flow, then login if it fails.                                                                     |
| `403`  | Student no longer has access.                          | Remove/disable the feedback action and refresh the surrounding content access state.                                            |
| `404`  | The asset has no published primary video content item. | Remove/disable the action and refresh the content/player state.                                                                 |
| `409`  | The video is not ready.                                | Preserve the draft, show a temporary unavailable message, and refresh/poll the surrounding video state before allowing a retry. |

Avoid optimistic “submitted” UI for this request. Disable duplicate submits
while it is in flight; a retry after a network failure is safe because the
operation updates the same student/video record.

## 5. Admin video-feedback list

```http
GET /api/v1/admin/video-feedback?page=1&limit=20&rating=5&from=2026-09-01&to=2026-09-30
Authorization: Bearer <admin-access-token>
```

All filters are optional. Combine them to narrow the moderation/support view.

| Query parameter | Type and meaning                                            |
| --------------- | ----------------------------------------------------------- |
| `page`          | One-based page; default `1`.                                |
| `limit`         | Results per page; default `20`, minimum `1`, maximum `100`. |
| `videoAssetId`  | Exact application video-asset ID.                           |
| `contentItemId` | Exact primary video content-item ID.                        |
| `studentId`     | Exact student user ID.                                      |
| `rating`        | Integer `1`–`5`.                                            |
| `from`          | Inclusive Cairo calendar date, `YYYY-MM-DD`.                |
| `to`            | Inclusive Cairo calendar date, `YYYY-MM-DD`.                |

`from` and `to` filter feedback **creation** dates in `Africa/Cairo`; a record
created on `to` is included. `from` must not be after `to`. Do not use browser
timezone conversions for these date-only filters.

```json
{
  "data": [
    {
      "id": "feedback_123",
      "comment": "The examples made this lesson much clearer.",
      "rating": 5,
      "createdAt": "2026-09-17T10:30:00.000Z",
      "updatedAt": "2026-09-17T10:35:00.000Z",
      "student": {
        "id": "student_123",
        "fullName": "Student Name",
        "loginIdentifier": "+201000000000"
      },
      "video": {
        "id": "video_asset_123",
        "filename": "lesson-1.mp4",
        "bunnyVideoId": "bunny-video-uuid",
        "durationSeconds": 900,
        "thumbnailUrl": "https://..."
      },
      "contentItem": {
        "id": "content_item_123",
        "title": "Lesson 1",
        "type": "VIDEO",
        "status": "PUBLISHED"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

`contentItem` can be `null` if the feedback's historical video owner is no
longer returned by the current relation. Render a neutral “content unavailable”
label rather than assuming it is always present. `thumbnailUrl` and
`durationSeconds` can also be `null` when the provider did not supply them.

Recommended list behavior:

- Keep filters in the URL. Reset `page` to `1` when any filter changes.
- Debounce only free-text client controls; these server filters are exact, so
  submit them on Apply/change as appropriate.
- Preserve filters when moving between pages, and render a successful empty
  response as “No feedback matches these filters.”
- Display `updatedAt` when the distinction between original and edited feedback
  matters. Date filters use `createdAt`, not `updatedAt`.

### Delete feedback

Administrators can permanently remove junk feedback from the moderation list:

```http
DELETE /api/v1/admin/video-feedback/feedback_123
Authorization: Bearer <admin-access-token>
```

```json
{ "id": "feedback_123", "deleted": true }
```

This action is irreversible. Require a confirmation that makes that clear, do
not offer an undo state, and remove the row from the current list only after a
successful `200` response. A `404` means the row was already removed or does
not exist; refresh the list and show a neutral “already removed” result. A
`401` or `403` means the current account cannot moderate feedback.

```ts
type VideoFeedbackListItem = {
  id: string;
  comment: string;
  rating: number;
  createdAt: string;
  updatedAt: string;
  student: { id: string; fullName: string; loginIdentifier: string };
  video: {
    id: string;
    filename: string;
    bunnyVideoId: string;
    durationSeconds: number | null;
    thumbnailUrl: string | null;
  };
  contentItem: {
    id: string;
    title: string;
    type: string;
    status: string;
  } | null;
};

type PaginatedVideoFeedback = {
  data: VideoFeedbackListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
```

## 6. Primary video assignment change

The existing admin endpoint keeps its request and success shape:

```http
POST /api/v1/admin/content-items/content_item_123/primary-asset
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{ "assetId": "video_asset_123" }
```

An asset whose kind is `VIDEO` can now be the primary asset of only one content
item. Reassigning the same video to another content item returns `409 Conflict`
with this stable code:

```json
{
  "statusCode": 409,
  "code": "VIDEO_ALREADY_ASSIGNED_TO_CONTENT_ITEM",
  "message": {
    "ar": "...",
    "en": "Video is already assigned to a content item"
  },
  "error": { "ar": "...", "en": "Conflict" },
  "correlationId": "..."
}
```

For this code, keep the editor's unsaved selection and tell the administrator
to choose a different video or remove/replace the video on its current content
item first. Refresh the target content item before a retry, since another admin
may have assigned the video concurrently. This restriction is specific to
**primary video** assets; it does not make non-video primary assets globally
unique.

## Delivery checklist

- [ ] Use Cairo date strings for activity and feedback date filters.
- [ ] Render zero-activity days from the daily-activity response.
- [ ] Obtain a parent token and select a child before loading daily activity.
- [ ] Add a dedicated `STUDENT_DEVICE_ALREADY_ACTIVE` login state.
- [ ] Add a confirmed admin reset-session action and display the revoked count.
- [ ] Submit video feedback with the application video-asset ID, an integer
      1–5 rating, and a non-empty comment.
- [ ] Gate the feedback form in the player UI, while handling the server's
      readiness, publication, and entitlement responses.
- [ ] Build the paginated admin feedback list with preserved exact filters.
- [ ] Require confirmation before permanently deleting feedback, then remove
      the successful row and handle `404` as already removed.
- [ ] Handle `VIDEO_ALREADY_ASSIGNED_TO_CONTENT_ITEM` in the primary-asset
      editor without overwriting the editor state.

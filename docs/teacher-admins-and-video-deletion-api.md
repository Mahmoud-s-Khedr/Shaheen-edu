# Teacher administration and video deletion: frontend handoff

All endpoints use `/api/v1` and the existing Bearer authentication and bilingual error format. This change is additive. Deploy migrations `20261117120000_teacher_video_deletion` and `20261117130000_video_upload_binding_guard` before starting the updated API. Dashboard implementation is outside this backend change.

## Contract conventions

- Paths in this document are relative to `/api/v1`. Replace `:id` and other path parameters with actual IDs.
- Protected requests use `Authorization: Bearer <accessToken>`. JSON mutations use `Content-Type: application/json`.
- Successful responses are returned directly; there is no extra success envelope. Collection responses use `{ data, meta }`.
- GET, PUT and PATCH return `200`; the POST endpoints documented here return `201` on successful handling. A deletion execution failure can still be a successfully handled POST: inspect its returned execution state.
- Dates in JSON responses are ISO 8601 strings. Nullable fields must be handled explicitly. IDs in examples are illustrative strings.
- Unknown request fields are rejected by the global validation pipeline. Do not serialize an entire form/model into a mutation when the endpoint accepts only a subset of fields.
- This document describes the teacher/deletion additions and the existing endpoints they change. The full existing hierarchy response schemas remain in [`../docs-json.json`](../docs-json.json).

### Endpoint inventory

**New routes:**

| Method | Path | Caller |
| --- | --- | --- |
| PUT | `/admin/admins/:id/scope` | Super admin |
| POST | `/admin/video-deletion-requests` | Teacher |
| GET | `/admin/video-deletion-requests` | Teacher / super admin |
| GET | `/admin/video-deletion-requests/:id` | Requesting teacher / super admin |
| POST | `/admin/video-deletion-requests/:id/approve` | Super admin |
| POST | `/admin/video-deletion-requests/:id/reject` | Super admin |
| POST | `/admin/video-deletion-requests/:id/retry` | Super admin |

**Existing routes with changed access, payloads or responses:**

| Methods | Path | Change |
| --- | --- | --- |
| POST | `/admin/admins` | Optional teacher role and initial course assignments |
| GET | `/admin/admins`, `/admin/admins/:id` | Includes teachers and current scope |
| PATCH | `/admin/admins/:id` | Teacher email changes supported |
| POST | `/admin/admins/:id/suspend`, `/admin/admins/:id/reactivate` | Teacher lifecycle supported |
| POST | `/admin/admins/:id/reset-password` | Teacher support; adds role/scope to response |
| POST | `/auth/admins/login` | Accepts teachers; returns scope |
| POST | `/auth/refresh` | Returns current scope |
| GET | `/auth/me` | Returns current scope |
| GET | `/admin/academic-grades`, `/admin/academic-grades/:id` | Scoped teacher reads |
| GET | `/admin/subjects`, `/admin/subjects/:id` | Scoped teacher reads and child counts |
| GET | `/admin/courses`, `/admin/courses/:id` | Scoped teacher reads |
| GET | `/admin/chapters`, `/admin/chapters/:id` | Scoped teacher reads |
| GET | `/admin/lessons`, `/admin/lessons/:id` | Scoped teacher reads |
| GET | `/admin/sections`, `/admin/sections/:id` | Scoped teacher reads |
| GET | `/admin/content-items`, `/admin/content-items/:id` | Scoped VIDEO reads |
| POST | `/admin/content-items` | Restricted teacher VIDEO draft creation |
| PATCH | `/admin/content-items/:id` | Restricted teacher draft metadata editing |
| POST | `/admin/content-items/:id/primary-asset` | Restricted teacher upload attachment |
| POST | `/admin/video-assets` | Validated body; optional binding, required for teachers |
| GET | `/admin/video-assets/:id`, `/admin/video-assets/:id/playback` | Scoped teacher reads and preview |
| POST | `/admin/video-assets/:id/upload-authorization` | Scoped upload ownership checks |
| POST | `/admin/video-assets/:id/upload-confirmation` | Scoped upload ownership checks |
| POST | `/admin/video-assets/:id/retry` | Scoped ownership checks; resets client completion state |
| GET | `/admin/video-feedback` | Scoped anonymous teacher reads |
| POST | `/student/video-assets/:videoAssetId/feedback` | Refuses feedback after deletion begins |
| POST | `/integrations/bunny-stream/webhook` | Ignores updates for videos marked for deletion |

The shared password-login service also adds `user.scope: null` to student and partner login responses. Existing video playback consumers stop issuing new playback URLs once deletion starts. Existing video archive/delete operations remain admin/super-admin operations and are also blocked by the deletion marker.

### Pagination and search

| Query | Default | Validation |
| --- | --- | --- |
| `page` | `1` | Integer, at least 1 |
| `limit` | `20` | Integer, 1–100 |
| `q` | Omitted | Trimmed string, 1–120 characters; only on search-enabled endpoints |

Admin account and hierarchy/content lists support `q`. Feedback and deletion-request lists accept pagination and their documented filters, not `q`. Deletion lists do not implement decision, execution, asset, course or requester filters.

Example collection response:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

`total` counts the filtered, authorized records. `totalPages` is zero when there are no records. Admin accounts, feedback and deletion requests sort newest first, with ID as the tie breaker. Hierarchy/content ordering follows the existing resource behavior.

## Accounts and session state

Super admins create teachers with `POST /admin/admins`:

```json
{
  "email": "teacher@example.com",
  "password": "StrongPassword123!",
  "role": "TEACHER",
  "courseIds": ["course-id"]
}
```

Omitting `role` creates an `ADMIN`, preserving existing clients. Only `ADMIN` and `TEACHER` may be created here. `courseIds` is optional for teachers; an empty list grants no course access. Accounts retain their original roles: email updates cannot convert roles.

`GET /admin/admins`, `GET /admin/admins/:id`, email updates, suspend/reactivate and password resets support teachers. Existing password reset behavior still forces a password change and revokes sessions. A reset additionally returns `role` and `scope` alongside `temporaryPassword` and `passwordResetAt`.

Replace a teacher's **complete** course list with super-admin-only `PUT /admin/admins/:id/scope`:

```json
{ "courseIds": ["course-a", "course-b"] }
```

Use `[]` to revoke all course access. IDs must identify existing courses and be unique. This endpoint cannot assign scope to ordinary admins or super admins. The response is the updated administrator summary.

Teachers use `POST /auth/admins/login` with the existing admin refresh cookie. Login, refresh, `/auth/me`, and administrator summaries return:

```json
{
  "role": "TEACHER",
  "scope": { "type": "COURSES", "courseIds": ["course-a"] }
}
```

Admins and super admins return `scope: null`. Scope is an interface hint, never an authorization token: the API reads current assignments on every request. Update navigation after a scope change or an inaccessible-resource response; a token refresh is unnecessary for permission changes.

## Teacher navigation and permissions

Teachers reuse the existing hierarchy list and detail endpoints:

| Resource | Visible records |
| --- | --- |
| Academic grades | Ancestors through subject–grade memberships of assigned courses |
| Subjects | Subjects with an assigned course; shared subjects can appear under multiple grades |
| Courses | Assigned courses |
| Chapters, lessons, sections | Descendants of assigned courses |
| Content items | VIDEO items in assigned courses |
| Video assets | Attached videos in assigned courses; own unfinished uploads bound to an accessible empty draft |
| Video feedback | Comments and ratings for assigned-course videos, without student identity |

Use existing parent filters, `q`, status, page, limit, and content-item multi-target filters. Permission scope intersects those filters; a mixed target selection cannot expand access. Existing sorting and status defaults remain. An inaccessible parent filter produces an empty list; an inaccessible detail ID produces `404`. Subject and grade `hasChildren` calculations use permitted children.

`GET /admin/video-feedback` supports its existing video/content/rating/date filters. The `studentId` filter remains super-admin-only; teachers receive `403` when using it. Teacher feedback rows contain no student object or student identifier. Teachers cannot delete feedback.

Teacher navigation should expose course browsing, video drafts, feedback, and their deletion request history. Hide publication, archive/restore, hierarchy editing, move/reorder, pricing/access changes, attachments, outlines, general asset administration, question banks, student administration and other admin screens. The API independently rejects those operations.

## Draft video upload flow

1. Create an empty draft through `POST /admin/content-items`, supplying only `type: "VIDEO"`, `title`, optional `description`, and one existing hierarchy `placement`. Access inherits from the hierarchy.
2. Create the asset with `POST /admin/video-assets` using `{ "title": "Lesson", "filename": "lesson.mp4", "contentItemId": "draft-id" }`. `contentItemId` is required for teachers. It must identify an accessible empty draft VIDEO item. The API persists that binding before issuing any upload authorization. New uploads return `409` once deletion has started for a bound video, including after a deletion failure.
3. Request `POST /admin/video-assets/:assetId/upload-authorization`, then send the bytes directly to Bunny using the existing TUS authorization response.
4. Confirm through `POST /admin/video-assets/:assetId/upload-confirmation`. Poll `GET /admin/video-assets/:assetId` until `status: "READY"`. Provider webhooks remain authoritative for processing state.
5. Attach with `POST /admin/content-items/:contentItemId/primary-asset`, body `{ "assetId": "asset-id" }`. A teacher can attach only their own READY asset bound to this empty draft. Teachers cannot replace an attached video.
6. Preview an accessible ready video through `GET /admin/video-assets/:assetId/playback`. Submit title/description edits through `PATCH /admin/content-items/:id` while the item is a draft. Admin or super-admin publication remains a separate step.

For a failed unattached upload, call `POST /admin/video-assets/:assetId/retry`, then repeat authorization and confirmation. Retry resets client completion state. Uploads, retries and confirmations require current course access and ownership of the unfinished upload. A published item cannot be edited by a teacher. Scope removal takes effect on the next API call.

The teacher create/update payloads deliberately reject extra writable fields such as access type, duration, text body and content type changes. Use the video asset endpoints above rather than the general `/admin/assets` API.

## Deletion requests and approval queue

| Method and path | Actor | Body / response |
| --- | --- | --- |
| `POST /admin/video-deletion-requests` | Teacher | `{ "assetId": "...", "reason": "..." }`; creates request |
| `GET /admin/video-deletion-requests` | Teacher / Super admin | Offset pagination; teachers see only their requests, super admins see all |
| `GET /admin/video-deletion-requests/:id` | Requester / Super admin | Request detail; super admins also receive current `affectedReferences` |
| `POST /admin/video-deletion-requests/:id/approve` | Super admin | `{ "reason": "optional decision note" }`; approves and attempts execution |
| `POST /admin/video-deletion-requests/:id/reject` | Super admin | `{ "reason": "required decision note" }`; rejects without modifying video |
| `POST /admin/video-deletion-requests/:id/retry` | Super admin | Retries an approved FAILED or interrupted IN_PROGRESS operation |

Ordinary admins cannot access this queue. Teachers can request deletion of any attached video in their assigned courses, or their own scoped unfinished upload. They cannot approve, reject, retry, or directly delete videos/content items. One active request per asset is enforced in the database. Duplicate requests return `409`; a rejected request allows a new request.

Request fields include `id`, `requesterId`, `assetId`, `contentItemId`, `courseId`, `snapshot`, `reason`, `decision`, `execution`, `reviewerId`, `decisionReason`, `reviewedAt`, `startedAt`, `completedAt`, `failureDetails`, `attempts`, `createdAt`, and `updatedAt`. Target IDs and the frozen snapshot remain after curriculum and asset deletion. Lists return `{ data, meta }` with the normal pagination shape.

For super admins, detail includes `affectedReferences`, keyed by model. Each entry contains `count` and `ids`. The inventory includes owning content, content attachments, question video links and asset blocks, assessment video pointers and snapshot assets/blocks, and feedback. **It includes references outside the requesting teacher's courses.** Fetch detail immediately before presenting the approval action, and explain that approval removes references globally. The approval audit records the references present when the decision commits.

A changed owning item, course or Bunny identity returns `409`. The API rejects the stale request with a decision reason explaining the change, freeing the asset for a fresh request. Refresh the queue and require a fresh teacher request; do not silently approve the changed target.

### Decision and execution state

| Decision | Execution | UI meaning |
| --- | --- | --- |
| PENDING | WAITING | Awaiting super-admin decision; video unchanged |
| REJECTED | WAITING | Decision recorded; video unchanged |
| APPROVED | IN_PROGRESS | Approval persisted; playback, replacement and new references blocked |
| APPROVED | FAILED | Execution failed; retain history and offer super-admin retry |
| APPROVED | COMPLETED | Bunny file and local asset/video records are gone |

Approval and retry return the persisted execution result. **HTTP 201 alone does not mean deletion succeeded.** Check `execution`. Show completion only for `COMPLETED`; display a failure state and retry action for `FAILED`. A competing execution returns `409`. Interrupted `IN_PROGRESS` requests remain retryable after a process restart.

Approval first commits the deletion marker. Cleanup then runs under database locks: it removes global references and the owning video content item (or retains it as an empty draft if other uploads are bound to it), clears question video links and assessment video pointers/timestamps, deletes the Bunny file, and removes the local asset/video records. Questions, assessment questions, attempts, answers, awarded points and other assessment snapshots survive. Feedback follows its existing cascade when the video record disappears.

Cleanup and remote deletion run in a transaction after the durable approval. A failed Bunny call rolls back local cleanup while keeping the deletion marker and failure history. If Bunny succeeds and local cleanup subsequently fails, retry treats Bunny `404` as success and finishes the local work. The operation never reports completion before both remote and local cleanup succeed. Already issued short-lived Bunny playback/upload URLs remain subject to their provider expiration; the API stops issuing new playback authorizations once approval is persisted.

## Detailed account and session contracts

### Create an account — `POST /admin/admins`

Super admin only; returns `201` with the administrator summary.

| Body field | Required | Rules |
| --- | --- | --- |
| `email` | Yes | Valid email; stored trimmed and lowercase; must be unique |
| `password` | Yes | String, 8–128 characters |
| `role` | No | `ADMIN` or `TEACHER`; default `ADMIN` |
| `courseIds` | No | Array of unique string course IDs; every course must exist |

For `TEACHER`, omitted `courseIds` and `[]` both grant no course access. For `ADMIN`, a nonempty course list returns `400`; omit the field. Course validation checks existence; this endpoint does not restrict assignments to published courses.

The common account summary returned by create, detail, update, suspend, reactivate and scope replacement is:

```json
{
  "id": "teacher-id",
  "role": "TEACHER",
  "scope": { "type": "COURSES", "courseIds": ["course-a"] },
  "status": "ACTIVE",
  "loginIdentifier": "teacher@example.com",
  "createdAt": "2026-11-17T12:00:00.000Z",
  "lastLoginAt": null
}
```

Scope course IDs are sorted by ID. These summaries do not contain a password or `mustChangePassword`; use login or `/auth/me` for the password-change flag.

Expected failures: malformed body `400`, unauthorized caller `401/403`, missing course `404`, duplicate email `409`.

### List, detail and email update

- `GET /admin/admins?page=1&limit=20&q=teacher`: returns `{ data: AccountSummary[], meta }`. Includes admins and teachers; no role/status query filter is added by this change.
- `GET /admin/admins/:id`: returns an account summary. A nonexistent account or an account outside the ADMIN/TEACHER roles returns `404`.
- `PATCH /admin/admins/:id`: body `{ "email": "new@example.com" }`; returns the updated summary. A conflicting email returns `409`. Do not include `role`, `courseIds` or `scope`.

All three routes require super-admin access. Account mutations cannot target a super-admin account, even the caller's own account (`403`).

### Replace scope — `PUT /admin/admins/:id/scope`

Required body: `{ "courseIds": ["course-a", "course-b"] }`. This is a replacement, not an append operation. Save the complete selection from the course picker. Removing a selected course removes that assignment; `[]` removes all assignments.

Returns `200` with the updated account summary. Missing/non-array/duplicate values fail validation (`400`). A target ordinary admin returns `400`, a super-admin target returns `403`, and a missing teacher or course returns `404`. The operation replaces assignments transactionally; invalid course IDs do not partially update the selection. There is no version field or merge operation; reload the current account before editing and replace local state with the returned summary after saving.

### Suspend, reactivate and reset password

| Route | Body | Success |
| --- | --- | --- |
| `POST /admin/admins/:id/suspend` | None | `201`, summary with `status: "SUSPENDED"`; sessions revoked |
| `POST /admin/admins/:id/reactivate` | None | `201`, summary with `status: "ACTIVE"` |
| `POST /admin/admins/:id/reset-password` | None | `201`, reset response below; account must be ACTIVE |

```json
{
  "temporaryPassword": "generated-temporary-password",
  "passwordResetAt": "2026-11-17T12:00:00.000Z",
  "role": "TEACHER",
  "scope": { "type": "COURSES", "courseIds": ["course-a"] }
}
```

Resetting an inactive account returns `409`. Password reset revokes existing sessions and sets `mustChangePassword: true`. Show the returned temporary password in the reset result; later account reads do not expose it. Reactivation does not restore previously revoked sessions.

### Login, refresh and current user

`POST /auth/admins/login` accepts `{ "email": "teacher@example.com", "password": "..." }`, returns `201`, and sets the existing HttpOnly `admin_refresh_token` cookie:

```json
{
  "accessToken": "jwt-access-token",
  "user": {
    "id": "teacher-id",
    "role": "TEACHER",
    "loginIdentifier": "teacher@example.com",
    "mustChangePassword": false,
    "scope": { "type": "COURSES", "courseIds": ["course-a"] }
  }
}
```

`POST /auth/refresh` uses the refresh cookie, rotates it and returns the same token/user shape with current assignments. Use browser credentials support (`credentials: "include"` for fetch) for login and refresh. Preserve the existing configured frontend Origin behavior: refresh chooses the application cookie for that origin; do not place the refresh token in a JSON body or try to read the HttpOnly cookie in JavaScript.

`GET /auth/me` uses the Bearer token and returns `id`, `role`, `status`, `loginIdentifier`, `lastLoginAt`, `createdAt`, `mustChangePassword` and `scope`. Login and refresh do not return that larger current-user shape.

When `mustChangePassword` is true, follow the existing `/auth/change-password` flow before opening protected teacher screens; other protected operations return `403` until the password is changed. Invalid credentials/session or a suspended account result in `401`; authentication throttling can return `429`.

## Detailed browsing and feedback contracts

### Hierarchy filters

All six hierarchy collections support `page`, `limit`, `q` and `status`. `status` accepts `DRAFT`, `PUBLISHED` or `ARCHIVED`; omission excludes archived records rather than restricting results to published records.

| Collection | Additional parent filter |
| --- | --- |
| `/admin/academic-grades` | None |
| `/admin/subjects` | `academicGradeId` |
| `/admin/courses` | `subjectId` |
| `/admin/chapters` | `courseId` |
| `/admin/lessons` | `chapterId` |
| `/admin/sections` | `lessonId` |

Use the corresponding `/:id` GET route for detail; detail responses keep their existing schemas. These routes grant read access only. Teachers can see an assigned course even if another staff member created it. A teacher without assignments receives empty scoped lists.

### Content list filters

`GET /admin/content-items` accepts `page`, `limit`, `q`, `status`, `type`, `accessType`, plus the following placement filters:

- Single IDs: `courseId`, `chapterId`, `lessonId`, `sectionId`.
- Multiple IDs: `courseIds`, `chapterIds`, `lessonIds`, `sectionIds`, encoded as comma-separated values or repeated query parameters.

IDs within each single/plural pair are merged. Placement selections are ORed across all hierarchy levels and include descendants. The resulting selection is then intersected with teacher course scope and the remaining query filters. Empty IDs in plural filters fail validation. A teacher querying `type=PDF` receives no records because teacher scope requires VIDEO.

Example: `GET /admin/content-items?courseIds=course-a,course-b&lessonId=lesson-c&type=VIDEO&page=1&limit=20` selects videos under any of those placements that the caller can access.

### Anonymous feedback — `GET /admin/video-feedback`

Returns `200` with `{ data, meta }`. Supported filters:

| Query | Meaning |
| --- | --- |
| `videoAssetId` | Exact video asset |
| `contentItemId` | Video attached as the item's primary asset |
| `rating` | Integer 1–5 |
| `from`, `to` | Inclusive Cairo calendar dates, `YYYY-MM-DD` |
| `studentId` | Super admin only; ADMIN and TEACHER receive `403` |
| `page`, `limit` | Standard pagination |

The range filters feedback creation time. `from` must be on or before `to` (`400` otherwise). Dates must be calendar dates, not full timestamps.

Example teacher row:

```json
{
  "id": "feedback-id",
  "comment": "Helpful explanation",
  "rating": 5,
  "createdAt": "2026-11-17T12:00:00.000Z",
  "updatedAt": "2026-11-17T12:00:00.000Z",
  "video": {
    "id": "asset-id",
    "filename": "lesson.mp4",
    "bunnyVideoId": "provider-video-id",
    "durationSeconds": 420,
    "thumbnailUrl": null
  },
  "contentItem": {
    "id": "content-item-id",
    "title": "Lesson video",
    "type": "VIDEO",
    "status": "PUBLISHED"
  }
}
```

`comment`, `rating`, video duration/thumbnail and `contentItem` can be null. There is no `student` property in teacher/admin rows. Super-admin rows additionally contain `student: { id, fullName, loginIdentifier }`. Teachers may read feedback regardless of who uploaded the accessible attached video; they cannot call `DELETE /admin/video-feedback/:id`.

## Detailed draft and upload contracts

### Create and edit the curriculum item

`POST /admin/content-items` returns `201` with the existing content-item summary. Example teacher payload:

```json
{
  "type": "VIDEO",
  "title": "Introduction",
  "description": "What this lesson covers",
  "placement": { "lessonId": "lesson-id" }
}
```

`title` is required, 1–200 characters. Optional `description` is at most 2,000 characters. `placement` must contain exactly one nonempty `courseId`, `chapterId`, `lessonId` or `sectionId` in an assigned course. The result starts as `DRAFT` with inherited access and no primary asset. Save the returned `id` for the upload binding.

`PATCH /admin/content-items/:id` returns `200` with the updated summary. Send only changed fields, for example `{ "title": "Updated introduction", "description": null }`. `description: null` clears it; an omitted field is unchanged. Teachers may update accessible draft VIDEO items, including drafts created by other staff; metadata editing is not limited to the uploader.

Extra teacher create/update fields such as `accessType`, `estimatedDuration`, `textBody` or changing `type` fail with `403` when they pass the general DTO validation. Unknown fields fail with `400`. A valid scoped VIDEO that is no longer DRAFT fails editing with `403`; an inaccessible/non-VIDEO target returns `404`.

The summary includes `id`, `type`, `title`, `description`, `textBody`, `externalUrl`, `accessType`, `estimatedDuration`, `status`, `placement`, `createdAt`, `updatedAt`, `publishedAt`, `archivedAt`, `primaryAssetId`, and `primaryAsset`. Placement contains its ID, the direct parent IDs/names and `sortOrder`. Do not assume every ancestor ID is populated: use the selected direct parent. `GET /admin/content-items/:id` additionally includes attachments, outline and richer primary video details; their presence does not grant teachers permission to edit them.

### Create the upload — `POST /admin/video-assets`

```json
{
  "title": "Introduction",
  "filename": "introduction.mp4",
  "contentItemId": "draft-id"
}
```

| Field | Validation |
| --- | --- |
| `title` | Required string, 1–200 characters; whitespace-only title rejected |
| `filename` | Optional string, maximum 255 characters; defaults to `video` |
| `contentItemId` | Required for teachers; nonempty string identifying an accessible empty DRAFT VIDEO |

When admins supply a binding, the empty-draft VIDEO requirement also applies. An invalid draft state returns `409`; missing teacher binding returns `400`; an inaccessible teacher target returns `404`. The stored filename is sanitized and truncated; use the returned filename for display.

Create returns `201`; read (`GET /admin/video-assets/:id`), confirmation and retry return the same summary shape:

```json
{
  "id": "asset-id",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "PENDING_UPLOAD",
  "filename": "introduction.mp4",
  "createdAt": "2026-11-17T12:00:00.000Z",
  "readyAt": null,
  "failedAt": null,
  "video": {
    "processingStatus": "CREATED",
    "processingProgress": 0,
    "durationSeconds": null,
    "thumbnailUrl": null,
    "clientUploadCompletedAt": null,
    "attempt": 1
  }
}
```

The summary does not expose the upload binding or Bunny credentials. Retain `contentItemId` and the returned asset `id` in the upload flow. Do not create another asset just to refresh the current upload authorization.

### Obtain authorization and upload bytes

`POST /admin/video-assets/:id/upload-authorization` has no body and returns `201`:

```json
{
  "endpoint": "https://video.bunnycdn.com/tusupload",
  "videoId": "provider-video-id",
  "libraryId": "configured-library-id",
  "expires": 1794918000,
  "signature": "generated-upload-signature"
}
```

`expires` is Unix time in seconds, not an ISO string or milliseconds. Pass the returned endpoint and authorization values to the existing Bunny TUS uploader. Use `videoId` for the provider video identifier; keep the API asset ID for API routes. Do not send the API Bearer token as Bunny authentication or expose server-side provider keys.

Authorization moves the asset to `UPLOADING`. READY/ARCHIVED assets return `409`. Teachers must own the unfinished asset, its bound item must remain an accessible draft, and the asset must not be attached. A visible asset that is ineligible for teacher upload operations returns `403`; assets outside the teacher's visibility return `404`.

### Confirm, monitor and retry

After the TUS upload finishes, call `POST /admin/video-assets/:id/upload-confirmation` with no body. It records `video.clientUploadCompletedAt` and changes an asset still in UPLOADING to `UPLOADED_AWAITING_PROCESSING`. Repeated confirmation preserves the existing completion timestamp and does not regress provider processing state. Confirming before authorization/start returns `409`.

Poll `GET /admin/video-assets/:id`. Suggested frontend behavior (polling intervals are a frontend choice, not an API guarantee):

| Asset status | Frontend behavior |
| --- | --- |
| PENDING_UPLOAD | Obtain upload authorization |
| UPLOADING | Show byte progress from the TUS uploader |
| UPLOADED_AWAITING_PROCESSING | Show upload complete, waiting for processing |
| PROCESSING | Show processing progress from `video.processingProgress` |
| READY | Enable attachment/preview as permitted |
| FAILED | Offer upload retry if the teacher still owns an eligible unfinished upload |
| ARCHIVED | No upload action |

Provider callbacks can skip intermediate states. Confirmation is not proof of readiness. Stop polling when the operation completes, fails, loses access, or the screen closes.

`POST /admin/video-assets/:id/retry` has no body and requires asset status FAILED (`409` otherwise). It preserves the API asset ID, creates a new Bunny video identity, increments `video.attempt`, resets client completion/progress/failure state, and returns PENDING_UPLOAD. Discard old upload authorization values and request fresh ones before uploading again. This upload retry is distinct from retrying a deletion request.

### Attach and preview

`POST /admin/content-items/:id/primary-asset` accepts `{ "assetId": "asset-id" }` and returns `201` with the content-item summary. The target must still be an empty DRAFT VIDEO; the asset must be READY, uploaded by this teacher and bound to this exact item. Teachers cannot use another teacher's upload, another draft's upload, or replace an existing primary asset. Refresh the item after a conflict rather than blindly repeating attachment.

`GET /admin/video-assets/:id/playback` returns `200`:

```json
{
  "embedUrl": "https://iframe.mediadelivery.net/embed/library/video?token=...&expires=...",
  "expiresAt": "2026-11-17T12:05:00.000Z"
}
```

Use `embedUrl` for the player and obtain a new URL after expiry if the caller still has access. A visible video that is not ready returns `409`. Teachers may preview attached videos in their scope and their own eligible bound uploads. API-issued URLs already obtained before scope removal or deletion approval expire according to provider rules.

## Detailed deletion request contract

### Request payloads and validation

| Operation | Body | Validation |
| --- | --- | --- |
| Create | `{ "assetId": "asset-id", "reason": "Remove outdated recording" }` | assetId: nonempty string; reason: string, 1–2,000 characters |
| Approve | `{ "reason": "Reviewed global references" }` or `{}` | Optional reason string, at most 2,000 characters |
| Reject | `{ "reason": "Recording is still required" }` | Required reason string, 1–2,000 characters |
| Retry | No body | Approved FAILED or interrupted IN_PROGRESS request |

The reason validators do not trim whitespace. Trim user input and reject blank reasons in the form. Only teachers create requests; ordinary admins have no queue access, and super admins do not create teacher requests through this route.

### Full response example

Create, detail and decision/retry operations return a request object; list wraps those objects in `{ data, meta }`.

```json
{
  "id": "request-id",
  "requesterId": "teacher-id",
  "assetId": "asset-id",
  "contentItemId": "content-item-id",
  "courseId": "course-a",
  "snapshot": {
    "title": "Outdated recording",
    "status": "PUBLISHED",
    "filename": "recording.mp4",
    "libraryId": "configured-library-id",
    "bunnyVideoId": "provider-video-id",
    "unfinishedUpload": false
  },
  "reason": "Replaced by a corrected recording",
  "decision": "PENDING",
  "execution": "WAITING",
  "reviewerId": null,
  "decisionReason": null,
  "reviewedAt": null,
  "startedAt": null,
  "completedAt": null,
  "failureDetails": null,
  "attempts": 0,
  "createdAt": "2026-11-17T12:00:00.000Z",
  "updatedAt": "2026-11-17T12:00:00.000Z"
}
```

| Fields | Meaning |
| --- | --- |
| `requesterId`, `reviewerId` | User IDs; no expanded account profile is included |
| `assetId`, `contentItemId`, `courseId` | Target IDs preserved after their original records disappear |
| `snapshot` | Frozen request-time metadata, not current content state |
| `snapshot.unfinishedUpload` | True if no owning primary attachment existed at request creation |
| `reason` | Teacher's original reason |
| `decisionReason` | Reviewer note or automatic stale-target rejection explanation |
| `reviewedAt` | Decision time; null before decision |
| `startedAt` | Time approval started the deletion; not refreshed for every retry |
| `completedAt` | Successful completion time; null before completion |
| `failureDetails` | Last recorded execution error; null initially/on successful completion |
| `attempts` | Recorded successful/failed execution attempts; not upload attempts |
| `updatedAt` | Last request update time |

`GET /admin/video-deletion-requests/:id` as super admin adds `affectedReferences`; list and mutation responses do not promise this property. Fetch detail separately for the approval preview. Teacher history is keyed to the requester, so the teacher can still read their own request after losing course access or after the video is deleted. Other teachers receive `404` even if they can currently access the video.

### Global reference preview and cleanup

Each `affectedReferences` entry has `{ "count": 1, "ids": ["record-id"] }`. All inventory keys are returned, including entries with zero records. The IDs identify records in the named model, not necessarily content-item IDs.

| Key | Cleanup on successful execution |
| --- | --- |
| `videoFeedback` | Removed by the existing video-record cascade |
| `contentItem` | Deletes the owning content item; clears the primary asset on other referring items |
| `assetReference` | Deletes attachment/reference rows |
| `questionVideoLink` | Deletes video links |
| `assessmentQuestion` | Clears video asset ID, video name and timestamp; keeps question snapshots |
| `questionAsset` | Deletes asset-link rows |
| `questionContentBlock` | Clears asset ID; keeps the block |
| `questionOptionContentBlock` | Clears asset ID; keeps the block |
| `questionContextContentBlock` | Clears asset ID; keeps the block |
| `assessmentQuestionAsset` | Deletes asset-link rows |
| `assessmentQuestionContentBlock` | Clears asset ID; keeps the block |
| `assessmentQuestionOptionContentBlock` | Clears asset ID; keeps the block |
| `assessmentContextContentBlock` | Clears asset ID; keeps the block |

When other uploads remain bound to the owner, cleanup retains the item as an empty DRAFT and clears publication/archive dates so those uploads remain accessible and attachable. Otherwise, the owning content-item deletion also removes its dependent records according to existing database relations. The reference preview is a current inventory, not a frozen execution plan: references may change between viewing detail and approval. Approval audits the references present at the decision. Preserve the warning that cleanup is global and permanent in the confirmation dialog.

### Per-operation behavior and conflicts

| Operation | Preconditions / expected failures |
| --- | --- |
| Create | Current scoped attached video, or caller-owned unfinished upload with an eligible draft target. No live request for the asset. Inaccessible/deleting asset: `404` for teacher; duplicate or changed/invalid curriculum target: `409`. Pending creation does not disable playback or editing. |
| List | Teacher: own records only; super admin: all. Accepts `page`/`limit`; newest first. |
| Detail | Missing/non-owned request: `404`. Super admin receives live global references. |
| Approve | Request must be PENDING. Already decided: `409`. Revalidates owner/course/Bunny identity; stale target becomes REJECTED and the call returns `409`. A fresh request is then required. |
| Reject | Request must be PENDING; otherwise `409`. Records reviewer/reason without touching the content/provider. A fresh request can be submitted after rejection. |
| Retry | Request must be APPROVED and FAILED or IN_PROGRESS; otherwise `409`. An execution already holding the lock returns `409`. No automatic background retry is introduced. |

Approval commits the deletion marker before execution, so APPROVED/FAILED still means the video is blocked. Do not offer teacher upload retry, replacement or playback to recover from a deletion failure. Only the super-admin deletion retry action resumes that workflow. There is no cancellation, decision reversal or unmark-deletion route in this change.

A Bunny error results in APPROVED/FAILED with `failureDetails`, normally returned as a `201` response to approve/retry. Local cleanup rolls back. If the remote delete succeeded before a local failure, the next execution accepts provider `404` and completes local cleanup. Both approve and retry may remain open while provider work runs; disable duplicate submission while awaiting the response.

After a network timeout, do not assume approval failed. Read the request detail: it may have committed, completed, failed, or remained IN_PROGRESS. Retry is appropriate for a persisted FAILED or interrupted IN_PROGRESS operation; an active concurrent executor returns `409`. There is no progress percentage or push subscription for deletion. Poll detail/list as needed and stop after terminal state or screen exit.

## Error handling and frontend state

Errors use the existing envelope:

```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST.VALIDATION_FAILED",
  "message": { "ar": "رسالة التحقق", "en": "Validation message" },
  "error": { "ar": "طلب غير صالح", "en": "Bad Request" },
  "details": [
    {
      "field": "courseIds",
      "code": "VALIDATION.ARRAYUNIQUE",
      "message": { "ar": "رسالة التحقق", "en": "Validation message" }
    }
  ],
  "correlationId": "request-correlation-id"
}
```

The localized strings above illustrate the structure, not exact translations. `details` is optional and primarily describes validation errors; `meta` may be present on other errors. Use the actual returned `code` and field paths for logic, render the chosen language from `message`, and retain `correlationId` for support. Do not match English message text.

| Status/state | Recommended frontend behavior |
| --- | --- |
| 400 | Show field/request validation errors; keep form input |
| 401 | Follow existing session refresh/sign-in behavior; do not retry indefinitely |
| 403 | Check password-change requirements and permissions; remove unavailable actions |
| 404 | Resource is missing or outside scope; clear its cached detail and reload permitted navigation |
| 409 | Refresh current resource/request state before offering the next action |
| 429 | Show throttling feedback and use existing retry/backoff behavior |
| APPROVED/FAILED in a 201 response | Show deletion failure details and super-admin retry; do not show completion |

Teacher scope guards intentionally hide inaccessible video IDs. After approval marks an asset, teacher video requests commonly return `404`, while admin/super-admin video requests can return `409` for deletion in progress. Use the deletion request as the durable status source rather than expecting the asset endpoint to remain readable.

### Cache invalidation and screen behavior

- After scope replacement, replace the displayed account summary and invalidate that teacher's cached hierarchy/content selections. Teachers should re-read `/auth/me` and permitted navigation after an access error or a known scope change; authorization does not wait for that refresh.
- After draft creation, invalidate its parent's content list; retain the returned item ID and upload asset ID until attachment completes.
- After upload retry, clear old TUS authorization/progress and restart with the same API asset ID. After attachment, reload item detail/list and stop the upload controls.
- After request creation, refresh teacher history and suppress duplicate request submission while the active request exists.
- Before super-admin approval, fetch detail and present the current global reference counts. After approve/reject/retry, replace the row from the returned request and fetch detail again when the reference preview is needed.
- After completed deletion, invalidate owning content detail/list, asset/player state, feedback and displayed reference data. Render request history from its snapshot rather than requiring live target lookups.
- A teacher with `scope.courseIds: []` needs an empty-state screen. They can still view their own deletion history; do not block every teacher route just because the course list is empty.

### Suggested acceptance scenarios

1. Create a teacher with two courses, sign in, and verify list/detail navigation excludes all other courses and non-VIDEO items.
2. Remove one assignment while the teacher remains signed in; the next request loses access without token refresh.
3. Create a draft at each supported placement level, upload/confirm/poll/attach, and verify extra fields, foreign uploads and replacement are rejected.
4. Confirm that draft metadata editing does not imply publishing, moving or pricing permission.
5. Verify feedback privacy and the `studentId` restriction, including a Cairo date range.
6. Create a deletion request; confirm pending status leaves the video usable and duplicate requests conflict.
7. Reject it; confirm content remains, the reason is visible and a fresh request is permitted.
8. Approve a request referencing multiple courses; confirm the dialog shows global impact and completion removes the video while keeping assessment results.
9. Simulate provider/local failure in a test environment; confirm FAILED is displayed despite HTTP 201, the video remains blocked and retry can finish.
10. Verify teacher history after scope removal and after target deletion, and deny another teacher's request detail.

## Deployment and verification

Apply the additive Prisma migration before rolling API instances. Generate the Prisma client as part of the application build. No role conversion or course backfill is performed; existing admins retain their roles, and teachers created without assignments have no course access.

The migration adds teacher assignments, upload bindings, persistent deletion requests, the active-request unique index, and reference/mutation guards using the existing asset reference advisory-lock key. Keep database guards when restoring or bootstrapping environments; `prisma db push` alone does not install custom migration SQL.

Authorization tests cover every discovered admin handler against the teacher allowlist. The dedicated `test/teacher-video-deletion.e2e-spec.ts` exercises session scope, hierarchy and Arabic search, mixed filters, scope changes, upload binding/retry, draft edits, privacy, duplicate/rejected requests, global reference cleanup, preserved assessment results, concurrent approval, Bunny failure/404, partial completion recovery, and teacher account lifecycle. Existing admin, super-admin, hierarchy, content, video and Swagger suites provide regression coverage.

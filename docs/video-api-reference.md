# Video APIs reference

This guide documents the video-asset APIs exercised against `https://api-edu.mydevtest.website` in [`reports/api-tests/api-2026-08-05T17-42-52-691Z.json`](../reports/api-tests/api-2026-08-05T17-42-52-691Z.json). The IDs, titles, timestamps, and state transitions below are from that run. Bearer tokens, Bunny upload signatures, and signed playback tokens are deliberately redacted: they are short-lived credentials, not reusable example values.

## How the flow fits together

```text
Admin creates asset → requests upload authorization → uploads directly to Bunny (TUS)
      → confirms upload → polls asset → Bunny webhook reports processing → READY
      → obtains a short-lived preview URL
```

All `/admin/video-assets` endpoints require an administrator Bearer token. Requests with a partner token were rejected with `403 FORBIDDEN.FORBIDDEN` in the recorded run. `id` is the application video-asset ID; `videoId` is Bunny Stream's UUID. They are different identifiers.

The asset has two related state fields:

- `status`: application lifecycle (`PENDING_UPLOAD`, `PROCESSING`, `READY`, or `ARCHIVED`).
- `video.processingStatus`: Bunny/upload lifecycle (`CREATED`, `UPLOADING`, `QUEUED`, `PROCESSING`, or `READY`).

## `POST /api/v1/admin/video-assets` — create an asset

Creates the application record and the associated Bunny Stream video. It does not upload the file; do that using the authorization returned by the next endpoint.

**Request**

```http
POST /api/v1/admin/video-assets
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "title": "Phase 9 video journey-20260805173810-49ee-75",
  "filename": "phase9-journey-20260805173810-49ee-video.mp4"
}
```

`filename` is optional in the observed run. Without it, the response filename was `"video"`.

**Recorded response — `201 Created`**

```json
{
  "id": "cmsgdidz401dzr301j22xhxqz",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "PENDING_UPLOAD",
  "filename": "phase9-journey-20260805173810-49ee-video.mp4",
  "createdAt": "2026-08-05T17:41:07.264Z",
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

## `POST /api/v1/admin/video-assets/{id}/upload-authorization` — authorize direct upload

Returns credentials for a direct, resumable TUS upload to Bunny. The browser/client uploads the bytes to `endpoint`; it does not send the video file through this API.

**Request**

```http
POST /api/v1/admin/video-assets/cmsgdidz401dzr301j22xhxqz/upload-authorization
Authorization: Bearer <admin-access-token>
```

There was no request body in the recorded call.

**Recorded response — `201 Created`**

```json
{
  "endpoint": "https://video.bunnycdn.com/tusupload",
  "videoId": "fc1df670-449b-4fed-8ae3-61ecb4f7d69b",
  "libraryId": "712744",
  "expires": 1785962467,
  "signature": "<redacted-short-lived-upload-signature>"
}
```

Use `videoId`, `libraryId`, `expires`, and `signature` exactly as returned when configuring the Bunny TUS request. Fetch a fresh authorization if it expires.

## `POST /api/v1/admin/video-assets/{id}/upload-confirmation` — confirm client upload

Call this after the direct Bunny upload completes successfully. It records the client-side completion time and moves the asset into processing. The report shows that a repeated call is safe: once the asset was ready, a second call returned the ready asset.

**Request**

```http
POST /api/v1/admin/video-assets/cmsgdidz401dzr301j22xhxqz/upload-confirmation
Authorization: Bearer <admin-access-token>
```

There was no request body in the recorded call.

**Recorded response — `201 Created`**

```json
{
  "id": "cmsgdidz401dzr301j22xhxqz",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "PROCESSING",
  "filename": "phase9-journey-20260805173810-49ee-video.mp4",
  "createdAt": "2026-08-05T17:41:07.264Z",
  "readyAt": null,
  "failedAt": null,
  "video": {
    "processingStatus": "QUEUED",
    "processingProgress": 0,
    "durationSeconds": null,
    "thumbnailUrl": null,
    "clientUploadCompletedAt": "2026-08-05T17:41:10.218Z",
    "attempt": 1
  }
}
```

## `GET /api/v1/admin/video-assets/{id}` — get an asset and its processing state

Poll this endpoint after confirmation to show upload/encoding progress. In the test run it progressed from `PROCESSING`/`QUEUED` to `READY`/`READY`.

**Request**

```http
GET /api/v1/admin/video-assets/cmsgdidz401dzr301j22xhxqz
Authorization: Bearer <admin-access-token>
```

**Recorded response — `200 OK` (ready)**

```json
{
  "id": "cmsgdidz401dzr301j22xhxqz",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "READY",
  "filename": "phase9-journey-20260805173810-49ee-video.mp4",
  "createdAt": "2026-08-05T17:41:07.264Z",
  "readyAt": "2026-08-05T17:41:24.287Z",
  "failedAt": null,
  "video": {
    "processingStatus": "READY",
    "processingProgress": 100,
    "durationSeconds": null,
    "thumbnailUrl": null,
    "clientUploadCompletedAt": "2026-08-05T17:41:10.218Z",
    "attempt": 1
  }
}
```

## `GET /api/v1/admin/video-assets/{id}/playback` — get an admin preview URL

Returns a signed, short-lived Bunny embed URL for previewing the asset. Treat it as temporary and do not persist or share it.

**Request**

```http
GET /api/v1/admin/video-assets/cmsgdidz401dzr301j22xhxqz/playback
Authorization: Bearer <admin-access-token>
```

**Recorded response — `200 OK`**

```json
{
  "embedUrl": "https://iframe.mediadelivery.net/embed/712744/fc1df670-449b-4fed-8ae3-61ecb4f7d69b?token=<redacted>&expires=1785951987",
  "expiresAt": "2026-08-05T17:46:27.000Z"
}
```

## `POST /api/v1/admin/video-assets/{id}/retry` — retry a failed asset

Use this only after the asset has failed. The report did not contain a successful retry because the tested asset was still uploadable; it recorded the guard response below.

**Request**

```http
POST /api/v1/admin/video-assets/cmsgdhcb30192r3019f6y3w0w/retry
Authorization: Bearer <admin-access-token>
```

**Recorded response — `409 Conflict` (asset was not failed)**

```json
{
  "statusCode": 409,
  "code": "CONFLICT.ONLY_FAILED_VIDEO_ASSETS_CAN_BE_RETRIED",
  "message": {
    "en": "Only failed video assets can be retried",
    "ar": "تعذر تنفيذ الطلب: تعارض"
  },
  "error": {
    "ar": "تعارض",
    "en": "Conflict"
  },
  "correlationId": "788ca8b3-c9d1-428b-bff8-edecb6a3f71c"
}
```

## `POST /api/v1/admin/video-assets/{id}/archive` — archive an asset

Archives an asset instead of deleting it. This is appropriate when it should no longer be used but its record should remain available.

**Request**

```http
POST /api/v1/admin/video-assets/cmsgdhcb30192r3019f6y3w0w/archive
Authorization: Bearer <admin-access-token>
```

**Recorded response — `201 Created`**

```json
{
  "id": "cmsgdhcb30192r3019f6y3w0w",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "ARCHIVED",
  "filename": "video",
  "createdAt": "2026-08-05T17:40:18.446Z",
  "readyAt": null,
  "failedAt": null,
  "video": {
    "processingStatus": "UPLOADING",
    "processingProgress": 0,
    "durationSeconds": null,
    "thumbnailUrl": null,
    "clientUploadCompletedAt": null,
    "attempt": 1
  }
}
```

## `DELETE /api/v1/admin/video-assets/{id}` — delete an unreferenced asset

Permanently deletes an unreferenced Bunny video asset. Use it for disposable/unattached assets; archive instead when retention is needed.

**Request**

```http
DELETE /api/v1/admin/video-assets/cmsgdjphh01nkr3014ljvy1mg
Authorization: Bearer <admin-access-token>
```

**Recorded response — `200 OK`**

```json
{
  "id": "cmsgdjphh01nkr3014ljvy1mg",
  "deleted": true
}
```

## `POST /api/v1/integrations/bunny-stream/webhook` — Bunny processing notification

This is Bunny Stream's server-to-server callback, not an admin endpoint. It receives the raw JSON notification and validates its HMAC signature. Do not call it from the browser, and preserve the raw body when computing/sending a signature.

**Request**

```http
POST /api/v1/integrations/bunny-stream/webhook
Content-Type: application/json
x-bunnystream-signature: <HMAC-SHA256 signature>
x-bunnystream-signature-algorithm: hmac-sha256
x-bunnystream-signature-version: v1

{"VideoGuid":"fc1df670-449b-4fed-8ae3-61ecb4f7d69b","Status":3,"Length":1}
```

`VideoGuid` is the Bunny UUID from upload authorization. In the recorded notification, `Status: 3` drove the asset to `READY`; the asset's `readyAt` was `2026-08-05T17:41:24.287Z`.

**Recorded response — `201 Created`**

```json
{
  "received": true
}
```

The same notification was accepted idempotently:

```json
{
  "received": true,
  "duplicate": true
}
```

An invalid signature was rejected with `401 UNAUTHORIZED.INVALID_BUNNY_STREAM_SIGNATURE`.

# Bunny integration guide

This API uses two Bunny products:

- **Bunny Storage + Pull Zone** for images, PDFs, documents, and downloadable
  files.
- **Bunny Stream** for direct video uploads, encoding, and protected playback.

The backend owns all Bunny secrets. Browsers receive only time-limited upload
or playback credentials.

## Architecture

```text
Admin browser ── upload non-video file ──> API ──> Bunny Storage
                                              │
Student browser <── signed Pull Zone URL ─────┘

Admin browser ── TUS direct upload ───────────> Bunny Stream
API <── signed processing webhook ───────────── Bunny Stream
Student browser <── signed player URL ───────── API
```

## Bunny dashboard setup

### Storage and delivery

1. Go to **Storage** → **Add Storage Zone**, name the zone, and enable
   **S3 Compatibility** before creating it.
2. Choose the zone's tier, region, and replication, then create it. S3
   compatibility is selected at creation time and cannot be enabled later for
   an existing Storage Zone.
3. Choose the S3 endpoint for the zone's region, for example
   `https://ny-s3.storage.bunnycdn.com`.
4. Go to **CDN**, create or open a Pull Zone, then set **Origin Type** to
   **Bunny Storage Zone** and select the Storage Zone.
5. In the Pull Zone's **Security** settings, enable **Token Authentication**
   and use **Advanced Token Authentication** for the URL format this API
   generates.
6. Keep the Storage Zone password and Pull Zone token key server-side.

### Video streaming

1. Create a **Bunny Stream Library**.
2. In **Security**, enable **Embed View Token Authentication** and add the
   production frontend hostname to **Allowed Domains**. Use hostnames without
   a scheme, for example `app.example.com`; add local development origins only
   where needed.
3. In the library's **API** section, retain both the Stream API Key and the
   Read-Only API Key in the server's secret manager.
4. Configure Bunny Stream to send processing webhooks to:

   ```text
   https://api.example.com/api/v1/integrations/bunny-stream/webhook
   ```

   The route must be reachable from Bunny over HTTPS. It is public only so
   Bunny can call it; the API verifies the signature before accepting it.

## Environment configuration

Copy the Bunny section of [`.env.example`](../.env.example) into the deployed
environment and replace every placeholder. Do not commit real credentials.

```env
# Bunny Storage
BUNNY_STORAGE_S3_ENDPOINT=https://ny-s3.storage.bunnycdn.com
BUNNY_STORAGE_BUCKET=your-storage-zone
BUNNY_STORAGE_ACCESS_KEY_ID=your-storage-zone
BUNNY_STORAGE_SECRET_ACCESS_KEY=your-s3-secret
BUNNY_STORAGE_PULL_ZONE_URL=https://your-private-zone.b-cdn.net
BUNNY_STORAGE_TOKEN_KEY=your-pull-zone-token-key
ASSET_URL_TTL_SECONDS=300

# Bunny Stream
BUNNY_STREAM_LIBRARY_ID=your-library-id
BUNNY_STREAM_API_KEY=your-stream-api-key
BUNNY_STREAM_READ_ONLY_KEY=your-stream-read-only-key
# Bunny uses the Stream API key as the Embed View Token security key.
BUNNY_STREAM_PLAYER_TOKEN_KEY=your-stream-api-key
BUNNY_STREAM_UPLOAD_TTL_SECONDS=10800
BUNNY_STREAM_PLAYBACK_TTL_SECONDS=300
```

### Where to find every value

| Environment variable | Where to find or choose it | Notes |
| --- | --- | --- |
| `BUNNY_STORAGE_S3_ENDPOINT` | Choose the endpoint matching the region selected while creating the S3-compatible Storage Zone. | Format: `https://[region]-s3.storage.bunnycdn.com`, for example `https://ny-s3.storage.bunnycdn.com`. It is not a secret. Supported region codes include `de`, `ny`, `sg`, `uk`, `se`, `la`, `jh`, and `syd`. |
| `BUNNY_STORAGE_BUCKET` | Bunny dashboard → **Storage** → open the Storage Zone. | Use the Storage Zone name exactly as shown. In Bunny's S3 API, the Storage Zone is the bucket. |
| `BUNNY_STORAGE_ACCESS_KEY_ID` | Use the same Storage Zone name used for `BUNNY_STORAGE_BUCKET`. | Bunny defines the S3 Access Key ID as the Storage Zone name; it is not a separate credential to create or copy. |
| `BUNNY_STORAGE_SECRET_ACCESS_KEY` | Bunny dashboard → **Storage** → open the Storage Zone → **Access** tab. | Use the Storage Zone Password shown there as the S3 Secret Access Key. Store it only in the server environment or secret manager. |
| `BUNNY_STORAGE_PULL_ZONE_URL` | Bunny dashboard → **CDN** → open the Pull Zone created for this Storage Zone. | Use the zone hostname, for example `https://my-assets.b-cdn.net`, or the production custom hostname if it points to that Pull Zone. |
| `BUNNY_STORAGE_TOKEN_KEY` | Bunny dashboard → **CDN** → open the Pull Zone → **Security** → enable **Token Authentication** → copy **URL Token Authentication Key**. | This is a Pull Zone URL-signing key; it is neither the Storage Zone secret nor a Stream API key. The code uses Bunny Advanced Token Authentication. |
| `ASSET_URL_TTL_SECONDS` | Choose in this application's deployment configuration. | No Bunny dashboard value exists. It is the lifetime, in seconds, of signed non-video asset URLs. The default is `300`; the minimum accepted by the application is `30`. |
| `ASSET_IMAGE_MAX_BYTES` | Choose in this application's deployment configuration. | No Bunny dashboard value exists. Maximum upload size for `COVER_IMAGE` and `IMAGE`; default `10485760` (10 MiB). |
| `ASSET_DOCUMENT_MAX_BYTES` | Choose in this application's deployment configuration. | No Bunny dashboard value exists. Maximum upload size for `PDF` and `DOCUMENT`; default `26214400` (25 MiB). |
| `ASSET_DOWNLOAD_MAX_BYTES` | Choose in this application's deployment configuration. | No Bunny dashboard value exists. Maximum upload size for `DOWNLOADABLE_FILE`; default `104857600` (100 MiB). |
| `BUNNY_STREAM_LIBRARY_ID` | Bunny dashboard → **Stream** → open the video library. | Copy the numeric library ID displayed for that library. It is not a secret. |
| `BUNNY_STREAM_API_KEY` | Bunny dashboard → **Stream** → open the video library → **API**. | Copy the **Stream API Key**. This server-only key creates videos and signs direct uploads. |
| `BUNNY_STREAM_READ_ONLY_KEY` | Bunny dashboard → **Stream** → open the video library → **API**. | Copy the library's read-only API key. This project uses it to verify signed Bunny Stream webhook requests. |
| `BUNNY_STREAM_PLAYER_TOKEN_KEY` | Use the same value found for `BUNNY_STREAM_API_KEY`: Bunny dashboard → **Stream** → video library → **API** → **Stream API Key**. | This is a project configuration name, not a separate Bunny dashboard field. Bunny uses the Video Library API key as the Embed View Token security key. |
| `BUNNY_STREAM_UPLOAD_TTL_SECONDS` | Choose in this application's deployment configuration. | No Bunny dashboard value exists. Lifetime of direct-upload authorization; default `10800` (3 hours), minimum `60`. |
| `BUNNY_STREAM_PLAYBACK_TTL_SECONDS` | Choose in this application's deployment configuration. | No Bunny dashboard value exists. Lifetime of signed player URLs; default `300` (5 minutes), minimum `30`. |

The application validates the required variables at startup. A missing value
prevents the API from starting, rather than silently serving unsigned content.

Official Bunny references: [Stream API key](https://docs.bunny.net/stream/authentication),
[embed view token authentication](https://docs.bunny.net/stream/token-authentication),
[TUS resumable uploads](https://docs.bunny.net/stream/tus-resumable-uploads),
[Stream webhooks](https://docs.bunny.net/stream/webhooks),
[Bunny Storage S3](https://docs.bunny.net/storage/s3), and
[Pull Zone token authentication](https://docs.bunny.net/cdn/security/token-authentication).

## File assets: Storage and Pull Zone

Administrators upload non-video assets through:

```text
POST /api/v1/admin/assets/upload?kind=COVER_IMAGE|IMAGE|PDF|DOCUMENT|DOWNLOADABLE_FILE
Content-Type: multipart/form-data
Authorization: Bearer <admin-token>
```

The API streams the file to Bunny Storage, validates its type and size, stores
the resulting storage key in the database, and records an audit event. The
browser never receives the Storage Zone credentials.

When an entitled user requests an attached asset, the API returns a short-lived
signed Pull Zone URL rather than a permanent storage URL:

```text
GET /api/v1/student/content-items/:contentItemId/assets/:assetId/access
Authorization: Bearer <student-token>
```

Public content uses the corresponding `catalog/content-items` route. Clients
should use the returned URL immediately and request a fresh access URL after it
expires. The default expiry is five minutes.

## Video workflow: Bunny Stream

Video bytes do not pass through the API. This avoids API bandwidth, timeout,
and memory pressure.

1. An administrator creates the video record:

   ```text
   POST /api/v1/admin/video-assets
   Authorization: Bearer <admin-token>

   { "title": "Lesson 1", "filename": "lesson-1.mp4" }
   ```

2. The API creates the Bunny Stream video and returns the internal asset ID.
3. The frontend requests a short-lived upload authorization:

   ```text
   POST /api/v1/admin/video-assets/:assetId/upload-authorization
   Authorization: Bearer <admin-token>
   ```

4. The frontend uploads directly to the returned TUS endpoint. Configure the
   TUS client with the returned `videoId`, `libraryId`, `expires`, and
   `signature` in the request headers required by Bunny Stream. Do not expose
   `BUNNY_STREAM_API_KEY` in the frontend.
5. Bunny Stream encodes the video and posts progress/final status to the
   webhook. The API records each event idempotently and changes the asset to
   `READY` only after Bunny reports a completed encode.
6. The client can poll `GET /api/v1/admin/video-assets/:assetId` while an
   administrator is uploading or waiting for encoding. Failed assets may be
   recreated with `POST /api/v1/admin/video-assets/:assetId/retry`.

For authorised viewing, the content asset access endpoint returns a signed
`iframe.mediadelivery.net` embed URL instead of a raw video URL. Embed that URL
in an iframe; do not construct Bunny player URLs in the frontend.

### Frontend TUS example

The authorization response uses the field name `expires`; Bunny's TUS protocol
expects the same value in the `AuthorizationExpire` header. A browser client
can use [`tus-js-client`](https://www.npmjs.com/package/tus-js-client):

```ts
import * as tus from 'tus-js-client';

const authorization = await fetch(
  `/api/v1/admin/video-assets/${assetId}/upload-authorization`,
  { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
).then((response) => response.json());

const upload = new tus.Upload(file, {
  endpoint: authorization.endpoint,
  headers: {
    AuthorizationSignature: authorization.signature,
    AuthorizationExpire: String(authorization.expires),
    LibraryId: String(authorization.libraryId),
    VideoId: authorization.videoId,
  },
  metadata: {
    filetype: file.type,
    title: file.name,
  },
  retryDelays: [0, 3000, 5000, 10000, 20000],
});

const previousUploads = await upload.findPreviousUploads();
if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
upload.start();
```

The authorization must remain valid for the entire upload. The configured
three-hour default exceeds Bunny's recommended one-hour minimum for direct
uploads.

## Webhook security and operations

The webhook handler requires these Bunny Stream headers:

- `x-bunnystream-signature`
- `x-bunnystream-signature-version: v1`
- `x-bunnystream-signature-algorithm: hmac-sha256`

It verifies the HMAC using `BUNNY_STREAM_READ_ONLY_KEY`, rejects invalid
requests with `401`, and records a unique event key so repeated delivery is
safe. Ensure the dashboard's signing configuration matches that key.

Keep the webhook endpoint outside any proxy rule that strips request bodies or
the headers above. The application needs the unmodified raw JSON body for HMAC
verification.

## Verification checklist

- Start the API with real Bunny variables; environment validation succeeds.
- Upload a small image or PDF and confirm its database asset reaches `READY`.
- Request content access and confirm the returned Pull Zone URL works before
  expiry and is rejected after expiry.
- Create and directly upload a test video, then confirm Bunny sends a webhook
  and the asset transitions to `READY`.
- Request access as an entitled student and confirm the signed embed URL plays.
- Confirm unauthorised users cannot obtain asset access URLs or create upload
  authorizations.

## Code locations

- Storage client and Pull Zone signing:
  `src/modules/assets/bunny-storage.provider.ts`
- File upload, validation, and signed asset access:
  `src/modules/assets/assets.service.ts`
- Stream video creation, upload authorization, webhook handling, and playback:
  `src/modules/videos/videos.service.ts`
- Webhook route:
  `src/modules/videos/videos.controller.ts`

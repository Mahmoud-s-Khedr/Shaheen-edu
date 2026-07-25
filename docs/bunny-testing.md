# Testing the Bunny integration

A hands-on guide to verifying Bunny Storage (files) and Bunny Stream (video) before
handing the APIs to the frontend. For dashboard setup and environment variables see
[`bunny-integration.md`](./bunny-integration.md); for the security model see
[`bunny-audit.md`](./bunny-audit.md).

## Three layers of testing

| Layer | Bunny | What it proves | When to use |
| --- | --- | --- | --- |
| **1. Automated tests** (`jest`) | Mocked | Validation, delivery signing, webhook verification, idempotency, failure/retry, role protection — deterministic, no credentials. | Every change; CI. |
| **2. End-to-end journey** (`CONTENT-003`) | **Real** | Storage upload → signed URL resolves; video create → signed TUS authorization. | Before frontend integration; after config changes. |
| **3. Phase 9 acceptance** (`CONTENT-007`) | **Real** | Complete hierarchy, real TUS bytes, verified webhook readiness, protected PDF/playback delivery, and denial boundaries. | Required release gate. |
| **4. Manual test console** (`dev/manual-test-console.html`) | **Real** | Interactive diagnosis of the live browser flow. | Troubleshooting and exploratory checks. |

Start at layer 1 (fast, free), then 2, then 3.

---

## Layer 1 — Automated tests (no Bunny credentials)

These stub the Bunny provider and `fetch`, so they never touch the network. Requires
Docker (Testcontainers spins up Postgres + Redis).

```bash
pnpm test        # unit specs (assets.service.spec.ts, videos.service.spec.ts)
pnpm test:e2e    # e2e specs (test/assets.e2e-spec.ts, test/videos.e2e-spec.ts, ...)
```

Covered: size/extension/MIME/magic-byte validation, empty/oversize/spoofed files,
provider-failure recording, no credential disclosure, reference protection, short-lived
access URLs, admin-only uploads; video secret non-disclosure, invalid webhook signatures,
duplicate webhooks, state transitions/regressions, failure metadata, retry, and
publication blocking while unready.

If these fail, fix them before touching real Bunny — the problem is in the code, not the
Bunny configuration.

---

## Layer 2 — End-to-end journey against real Bunny

`CONTENT-003` drives the real API against your real Bunny account: it uploads a file to
Bunny Storage, publishes content, and confirms the signed CDN URL actually resolves; then
it creates a real Bunny Stream video and a signed direct-upload authorization. It also
checks reference protection, primary-asset replacement, unready-video publication
blocking, the retry guard, and partner/anonymous denial.

> The live TUS byte-upload + encode + webhook + playback is **not** in this journey (it is
> async and needs a public webhook) — that is Layer 3.

### Prerequisites

1. A Storage Zone (S3 compatibility **on**) + Pull Zone with Token Authentication, and a
   Stream Library — see [`bunny-integration.md`](./bunny-integration.md).
2. Real values filled into `.env` (`BUNNY_STORAGE_*`, `BUNNY_STREAM_*`).

### Run

```bash
# 1. Start the API with your real .env (Postgres, Redis, API on :3000).
pnpm dev:start

# 2. Run the journey (pulls in the auth + hierarchy prerequisites automatically).
JOURNEY_ALLOW_MUTATIONS=true \
JOURNEY_BASE_URL=http://localhost:3000 \
JOURNEY_SUPER_ADMIN_EMAIL="superadmin@example.com" \
JOURNEY_SUPER_ADMIN_PASSWORD="ChangeThisPassword123!" \
pnpm journey:content:delivery
```

`JOURNEY_ALLOW_MUTATIONS=true` is a deliberate safety switch — the runner refuses to make
changes without it, and refuses production-like hostnames.

### Reading the result

Every step prints `PASS`; the summary shows `Passed: N / Failed: 0`. Add `--verbose` for
per-request detail, or `--json` to write a redacted report to `reports/journeys/`. On a
failure the step name, HTTP status, and a **redacted** body are printed — secrets are
never logged.

### What a green run tells you

- Storage upload, validation, and **token-authenticated CDN delivery** work end to end
  (the journey fetches the signed URL and requires a 2xx).
- The Stream video is created in your library and a valid TUS authorization is returned.
- Access control and lifecycle rules hold on the real server.

> This creates real artifacts: files land in your Storage Zone and a video object is
> created in your Stream Library (the journey archives the local record but does not
> delete the remote Bunny Stream video — see the audit note in `bunny-audit.md`). Use a
> non-production Bunny account.

### Related journeys

```bash
pnpm journey:content:hierarchy   # CONTENT-001, Phase 1 (no Bunny)
pnpm journey:content:basic       # CONTENT-002, Phase 2 (no Bunny)
pnpm journey:list                # list all journeys
```

---

## Layer 3 — Phase 9 full live acceptance

`CONTENT-007` is the required non-production release gate. It uses real Bunny
Storage and Stream services, uploads a valid MP4 through TUS, waits for Bunny's
signed webhook to mark it ready, and verifies protected PDF and playback access
for an entitled student while rejecting a non-entitled student and a partner.

The Stream Library webhook must point at the externally reachable API URL before
running it. Use a dedicated Bunny library/storage zone because the journey creates
real artifacts and intentionally retains published-course evidence for review.

```bash
JOURNEY_ALLOW_MUTATIONS=true \
JOURNEY_BASE_URL=http://localhost:3000 \
JOURNEY_SUPER_ADMIN_EMAIL="superadmin@example.com" \
JOURNEY_SUPER_ADMIN_PASSWORD="ChangeThisPassword123!" \
JOURNEY_VIDEO_FILE=/absolute/path/to/small-valid.mp4 \
JOURNEY_BUNNY_WEBHOOK_URL=https://your-public-api.example/api/v1/integrations/bunny-stream/webhook \
pnpm journey:content:integration
```

`JOURNEY_VIDEO_READY_TIMEOUT_MS` defaults to 10 minutes and
`JOURNEY_VIDEO_POLL_INTERVAL_MS` to 5 seconds. The runner reports the configured
webhook URL when readiness times out. Remove unreferenced failed/test video assets
explicitly through `DELETE /admin/video-assets/:id`; it deletes the Bunny object
and is blocked while any content or question reference remains.

## Layer 4 — Manual test console (full live video flow)

`dev/manual-test-console.html` is a dev-only page that logs in as an admin and drives every
flow, including the real browser TUS upload and protected playback that the journey cannot
automate.

### One-time setup for the webhook

Bunny marks a video `READY` by calling your webhook after it finishes encoding. Your local
API must be reachable from Bunny over HTTPS:

```bash
cloudflared tunnel --url http://localhost:3000
```

This prints a public `https://<random>.trycloudflare.com` URL (no account or login
needed for a quick tunnel; the URL changes on every restart).

Then in the Bunny dashboard → Stream Library → set the webhook URL to:

```
https://<random>.trycloudflare.com/api/v1/integrations/bunny-stream/webhook
```

The route is public only so Bunny can reach it; the API verifies the HMAC signature
(using your Read-Only API Key) before accepting anything.

### Run

```bash
pnpm start:dev            # API on :3000 with your real .env
npx serve dev -l 5173     # serve the console (http://localhost:5173 is CORS-allowed)
```

Open <http://localhost:5173/manual-test-console.html>, log in with an admin, then:

**Storage panel**
1. Pick a kind (PDF/IMAGE/…), choose a file, **Upload** → expect `READY`.
2. **Refresh list** and confirm the asset; archiving a referenced asset returns `409`.
3. **Publish & get URL** → open the protected link; it must load before its ~5-minute
   expiry and fail after.

**Video panel**
1. **Create video asset** → status `PENDING_UPLOAD`.
2. Choose a video file → **Authorize + upload to Bunny** (real TUS upload; watch progress).
3. **Poll status** (or auto-poll) until Bunny's webhook flips it to `READY`.
4. **Publish & get embed URL** → the video plays in the embedded iframe.
5. Try **Retry** (only valid on a failed asset) and **Archive**.

---

## End-to-end acceptance checklist

- [ ] `pnpm test` and `pnpm test:e2e` pass.
- [ ] `pnpm journey:content:delivery` passes against real Bunny.
- [ ] `pnpm journey:content:integration` passes against real Bunny with a real TUS upload and webhook.
- [ ] Console: a small image/PDF uploads and reaches `READY`.
- [ ] Console: a published asset returns a signed URL that works before expiry and is
      rejected after.
- [ ] Console: a real video uploads via TUS, Bunny fires the webhook, and the asset
      becomes `READY`.
- [ ] Console: the signed embed URL plays for an authorized viewer.
- [ ] Unauthorized users cannot obtain access URLs or create upload authorizations
      (covered by the journey and e2e).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Upload returns `500`, asset persists as `FAILED` | Bad `BUNNY_STORAGE_*` (bucket/key/secret/endpoint) or S3 compatibility not enabled on the zone. | Re-check the Storage Zone name (it is both bucket and access-key id), the Access-tab password, and the regional `*-s3.storage.bunnycdn.com` endpoint. |
| Signed CDN URL returns `403`/`401` | Pull Zone Token Authentication off, or `BUNNY_STORAGE_TOKEN_KEY` ≠ the Pull Zone URL Token Authentication Key. | Enable Token Authentication and copy the exact key; do not enable IP/country/directory locking (not part of the signature). |
| Upload rejected `400` before reaching Bunny | Validation: unsupported MIME for kind, filename extension mismatch, wrong magic bytes, empty, or oversize. | Match kind ↔ MIME ↔ extension; check the `ASSET_*_MAX_BYTES` limits. |
| Video never leaves `PENDING_UPLOAD`/`UPLOADING` | Webhook not reaching the API (tunnel down, stale `trycloudflare.com` URL after a restart, proxy stripping the body/headers). | Point the library webhook at the current `cloudflared` HTTPS URL; keep the raw JSON body and `x-bunnystream-*` headers intact. |
| Webhook rejected `401` | Signature mismatch — `BUNNY_STREAM_READ_ONLY_KEY` wrong, or a proxy altered the body. | Use the library's Read-Only API Key and ensure nothing rewrites the request body. |
| Video create returns `400` | Bad `BUNNY_STREAM_LIBRARY_ID` or `BUNNY_STREAM_API_KEY`. | Copy the numeric library id and the Stream API Key from the library's API tab. |
| Embed URL does not play | Embed View Token Authentication off, allowed domains missing, or the asset is not `READY`. | Enable Embed View Token Authentication, list the frontend hostname (no scheme), and wait for `READY`. |
| Journey refuses to start | `JOURNEY_ALLOW_MUTATIONS` not set, or a production-like host. | Set `JOURNEY_ALLOW_MUTATIONS=true` and target localhost/staging only. |

## Code map

- Storage client + Pull Zone signing — `src/modules/assets/bunny-storage.provider.ts`
- Upload, validation, signed asset access, delete/replace — `src/modules/assets/assets.service.ts`
- Stream create, upload authorization, webhook, playback — `src/modules/videos/videos.service.ts`
- Webhook route — `src/modules/videos/videos.controller.ts`
- End-to-end journey — `scripts/journeys/content/full-content-delivery.journey.ts`
- Manual console — `dev/manual-test-console.html`

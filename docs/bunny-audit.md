# Bunny integration audit

Audit date: 2026-07-24

## Summary

The backend has a sound, server-controlled Bunny integration for file assets
and video. It uses Bunny Storage through its S3-compatible API, Bunny CDN Pull
Zone signed URLs for file delivery, and Bunny Stream for direct browser video
uploads and protected playback. No application code was changed as part of
this audit.

## Compatibility matrix

| Area | Current implementation | Assessment | Required Bunny configuration |
| --- | --- | --- | --- |
| Storage writes | AWS `S3Client`, `PutObject`, `DeleteObject`, and `forcePathStyle: true`. | Compatible with Bunny's path-style S3 API. | Create the Storage Zone with S3 Compatibility enabled; this cannot be enabled later. |
| Storage credentials | Bucket and S3 key ID come from environment; secret is kept server-side. | Compatible when bucket/key ID are the Storage Zone name and the secret is its Access-tab password. | Use the selected zone's regional `https://[region]-s3.storage.bunnycdn.com` endpoint. |
| File delivery | Pull Zone URLs use `HS256-` plus Base64URL HMAC-SHA256 over `path + expires`. | Matches Bunny Advanced Token Authentication without optional signing data or IP binding. | Enable Pull Zone Token Authentication and retain the URL Token Authentication Key server-side. |
| Direct video upload | Backend creates a Stream video and returns a SHA-256 TUS authorization. | Matches Bunny's required `libraryId + apiKey + expiration + videoId` signature. | Use the returned endpoint and send all four required TUS headers. |
| Video playback | Backend signs Bunny's iframe embed URL with API key, video GUID, and expiry. | Matches Embed View Token Authentication. | Enable Embed View Token Authentication and restrict allowed embed domains. |
| Processing webhooks | Raw body is retained; HMAC-SHA256 is validated using the Read-Only API Key and compared in constant time. | Matches Bunny webhook v1 verification guidance. | Configure the library callback URL and preserve body/headers through proxies. |

## Required deployment configuration

### Bunny Storage and CDN

1. Create a Storage Zone with **S3 Compatibility** enabled, choose its region,
   tier, and replication before creation, then record its name and password.
2. Point `BUNNY_STORAGE_S3_ENDPOINT` at the selected region's S3 endpoint.
   Bunny requires path-style S3 URLs; the current SDK client is configured for
   that mode.
3. Create a Pull Zone with **Origin Type: Bunny Storage Zone**, selecting that
   Storage Zone.
4. Enable Token Authentication in Pull Zone **Security**, use its **URL Token
   Authentication Key** for `BUNNY_STORAGE_TOKEN_KEY`, and keep it out of the
   browser.
5. Use the Pull Zone hostname (or a correctly configured custom hostname) as
   `BUNNY_STORAGE_PULL_ZONE_URL`.

### Bunny Stream

1. Create a Stream Library and record its numeric library ID, Stream API Key,
   and Read-Only API Key.
2. Set `BUNNY_STREAM_PLAYER_TOKEN_KEY` equal to the Stream API Key. This
   project name represents Bunny's Embed View Token signing key; it is not a
   separate dashboard secret.
3. Enable Embed View Token Authentication and list every production frontend
   hostname in Allowed Domains. Do not include `https://` in a domain entry.
4. Configure the webhook to `https://<api-host>/api/v1/integrations/bunny-stream/webhook`.
   It must be publicly reachable over HTTPS and pass the original JSON request
   body plus the `X-BunnyStream-*` headers unchanged.
5. Implement browser uploads through TUS only; never expose the Stream API Key
   or route video bytes through the API server.

## Operational and security observations

- The three-hour upload authorization default is above Bunny's one-hour
  recommendation for TUS uploads, but a client should request fresh
  authorization if its upload cannot finish before expiry.
- Signed file and playback URLs default to five minutes. Clients must request
  fresh access URLs after expiry instead of caching them indefinitely.
- This integration deliberately does not use CDN IP locking, country limits,
  or directory tokens. Enabling any of those Pull Zone features without adding
  the matching values to the signature would break file delivery.
- S3 compatibility is a Bunny preview feature and limits available replication
  points relative to Bunny's HTTP/FTP storage access. Monitor Bunny's S3
  documentation before changing regions or replication strategy.
- Archiving a non-video asset deletes its Storage object. Archiving a video
  currently marks the local asset archived but does not remove its Bunny Stream
  video; failed videos replaced by retry are also retained. This preserves
  recovery evidence but can continue to consume Bunny Stream storage.
- Webhook processing is idempotent. Duplicate Bunny events are persisted only
  once and do not repeat state transitions.

## Future code changes (not implemented)

- Consider adding an explicit storage-region environment variable and passing
  it to the AWS SDK signer rather than using `region: 'auto'`; confirm this in
  a real Bunny S3 environment before changing credentials or endpoints.
- Consider deleting the remote Bunny Stream video during archive, with a clear
  failure policy that prevents the local record being archived if remote
  deletion fails.
- Add an operational reconciliation job to identify Bunny Stream videos that
  no longer have an active local asset, before any bulk deletion is permitted.
- Add retry/backoff and metrics around Bunny Storage and Stream API failures,
  especially for Storage rate-limit responses and processing webhook delays.

## Official references

- [Bunny Storage S3 compatibility](https://docs.bunny.net/storage/s3)
- [Bunny Storage quickstart](https://docs.bunny.net/storage/quickstart)
- [Advanced CDN token authentication](https://docs.bunny.net/cdn/security/token-authentication/advanced)
- [Bunny Stream TUS resumable uploads](https://docs.bunny.net/stream/tus-resumable-uploads)
- [Bunny Stream embed view token authentication](https://docs.bunny.net/stream/token-authentication)
- [Bunny Stream webhook verification](https://docs.bunny.net/stream/webhooks)
- [Bunny Stream video deletion API](https://docs.bunny.net/api-reference/stream/manage-videos/delete-video)

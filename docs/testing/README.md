# Running current-system journeys

Start the local stack with migrations and seed, copy `.env.journeys.example` to a local environment file, export its values, and run `pnpm journey:current`.

Use `pnpm journey:list` to inspect IDs, individual `journey:*` scripts for focused runs, and `pnpm journey:current -- --json` to write a redacted report under `reports/journeys/`. `--retain-created-data` is accepted explicitly; records are retained by default because account cleanup APIs are not available. The runner only talks to HTTP endpoints and refuses production targets. It requires `JOURNEY_ALLOW_MUTATIONS=true`; non-local targets require `JOURNEY_TARGET=staging` and `JOURNEY_CONFIRM_STAGING_MUTATIONS=true`.

## Full local API acceptance

`pnpm api:contract:check` verifies that the 183-operation OpenAPI inventory in
`docs-json.json` is identical to the inventory in `docs/api-reference.md`.

The full suite treats an operation as covered only when a real application
request reaches it. Cleanup traffic is deliberately excluded from coverage.
It validates successful JSON responses against the runtime OpenAPI schema and
the final report lists every operation that was not exercised.

To run the complete HTTP acceptance suite, copy `.env.api-tests.example` to
`.env.api-tests.local`, fill it with credentials for dedicated non-production
Bunny Storage and Stream resources, and provide a small valid MP4 via
`API_TEST_VIDEO_FILE`. Then run:

```sh
pnpm api:test:full
```

The same file already supplies `BUNNY_STREAM_READ_ONLY_KEY`; the runner passes
it only as `JOURNEY_BUNNY_READ_ONLY_KEY` to sign the direct webhook acceptance
case. It is redacted from reports and never sent to the API as an application
credential.

The command starts `docker-compose.api-test.yml` as the
`shaheen-edu-api-test` Compose project, exposing only its API on
`127.0.0.1:3101`. It creates a fresh database and Redis instance, runs the
real HTTP journeys, checks runtime OpenAPI against both documentation files,
writes a redacted per-operation report to `reports/api-tests/`, attempts to
delete created Bunny-backed resources, and removes only that test project and
its volumes on exit. It never uses the normal local Compose project or its
data. A failed remote cleanup makes the command fail and is listed in the
report for manual follow-up.

# Running current-system journeys

Start the local stack with migrations and seed, copy `.env.journeys.example` to a local environment file, export its values, and run `pnpm journey:current`.

Use `pnpm journey:list` to inspect IDs, individual `journey:*` scripts for focused runs, and `pnpm journey:current -- --json` to write a redacted report under `reports/journeys/`. `--retain-created-data` is accepted explicitly; records are retained by default because account cleanup APIs are not available. The runner only talks to HTTP endpoints and refuses production targets. It requires `JOURNEY_ALLOW_MUTATIONS=true`; non-local targets require `JOURNEY_TARGET=staging` and `JOURNEY_CONFIRM_STAGING_MUTATIONS=true`.

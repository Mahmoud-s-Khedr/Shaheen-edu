# Production observability and backup plan

**Scope:** the production architecture in
[production-deployment.md](production-deployment.md): Docker Compose runs API,
worker, and Redis; host operations run Nginx and PostgreSQL.

## Ownership and boundaries

| Area | Owner | Repository behavior |
| --- | --- | --- |
| API gateway, API replicas, worker, Redis logs | Repository-managed Docker services | Emits structured diagnostic events and is collected hourly. |
| Nginx diagnostic access log | Host operations | Writes only the redacted JSONL source configured in `default.conf.template`. |
| PostgreSQL service, diagnostic normalization, backup scheduling, restore-target creation, retention | Host operations | PostgreSQL remains host-managed; operator controls its safe JSONL normalizer and backup policy. |
| PostgreSQL backup and isolated restore | Repository scripts run on host | Uses host client tools and Restic; never provisions or operates the PostgreSQL service. |
| Database migration | Shared release process | `release-with-backup.sh` runs a remote-confirmed host backup before the migration container. |

The backup and restore scripts use the host PostgreSQL client tools rather than
a Compose `postgres` container. They do not install PostgreSQL, change its
configuration, create databases or roles, create a backup timer, or overwrite
a live database.

The included four-hour systemd timer is optional until a successful manual
backup and isolated restore drill are recorded. When installed through the
operator's normal systemd process, it invokes only `postgres-backup.sh` and has
no Docker or PostgreSQL-service dependency.

## Diagnostic bundles

Every hour, the root-only systemd unit creates one compressed bundle under
`/var/lib/shaheen-edu-diagnostics`, uploads it to the private Bunny prefix
`operations/diagnostic-bundles/`, and keeps exactly 30 days. Pruning is scoped
to that prefix only; the database backup retention policy is unchanged.

Each archive contains `api-gateway.jsonl`, `api.jsonl`, `worker.jsonl`,
`redis.jsonl`, and, when available, `nginx.jsonl` and `postgres.jsonl`. Its
`manifest.json` lists coverage, unavailable sources, collection window,
version, and per-file checksums. A missing host source is recorded without
discarding the rest of the bundle.

Set `OBSERVABILITY_HMAC_SECRET` to a distinct, at-least-32-character secret in
every environment. Generate it with `openssl rand -base64 48`, store it in the
environment used by both API and worker, and never reuse it across environments.
The application uses it to produce stable opaque `*_ref` values for users and
entities. The repository's development and production `.env.example` files
include the required placeholder. Set `OBSERVABILITY_LOG_RETENTION_DAYS=30`;
other values are rejected.
Set `POSTGRES_SLOW_QUERY_THRESHOLD_MS` (default `1000`) in the host operator
configuration when rendering the PostgreSQL include file.

Host PostgreSQL must include
[`diagnostic.conf.example`](../deploy/production/postgresql/diagnostic.conf.example)
through the operator-managed configuration and normalize its output to
`/var/log/postgresql/shaheen-edu-diagnostic.jsonl`. The normalizer must emit
only timestamp, numeric UTC `timestampEpochSeconds`, severity, duration,
fingerprint, correlation ID when available, and reason code—never SQL text or
bind values. The numeric epoch is the collector's authoritative hourly-window
field; timestamps with local UTC offsets are not compared as strings.

Install the repository's
[`shaheen-edu-diagnostic` logrotate policy](../deploy/production/logrotate/shaheen-edu-diagnostic)
at `/etc/logrotate.d/shaheen-edu-diagnostic` on the host. It retains the Nginx
diagnostic source for at most 30 days and signals Nginx to reopen the file.
PostgreSQL's operator-managed normalizer needs a separate equivalent policy,
including its own reopen/restart action. The collector reads the active source
and its uncompressed `.1` predecessor, so a rotation between hourly runs does
not create a collection gap.

```sh
cd /opt/shaheen-edu/deploy/production

# Install and dry-run the Nginx diagnostic-log retention policy once.
sudo install -o root -g root -m 0644 logrotate/shaheen-edu-diagnostic /etc/logrotate.d/shaheen-edu-diagnostic
sudo logrotate -d /etc/logrotate.d/shaheen-edu-diagnostic

# Create an on-demand one-hour bundle (normal scheduling uses the systemd timer).
sudo ./scripts/export-incident-logs.sh 1h

# Inspect a downloaded archive locally, then reconstruct one timeline.
tar -xzf 20260909T120000Z-host.tar.gz
jq -c 'select(.correlationId == "<correlation-id>")' *.jsonl

# Find a known safe failure reason, database fingerprint, or opaque entity ref.
jq -c 'select(.reasonCode == "COURSE_GRADE_FILTER_EXCLUDED_ALL")' api.jsonl
jq -c 'select(.errorFingerprint == "<fingerprint>")' *.jsonl
jq -c 'select(.references.subject == "subject_<hmac>")' *.jsonl

# Diagnose latency, queue retry exhaustion, or the last aggregate integrity scan.
jq -c 'select((.durationMs // 0) > 1000)' *.jsonl
jq -c 'select(.event == "queue_retry_exhausted")' worker.jsonl
jq -c 'select(.event == "data_integrity_scan_completed")' worker.jsonl
```

The host Nginx `$request_id` is the canonical `X-Correlation-ID`, forwarded by
the private gateway into API/CLS and returned to clients in the response
header. Queue metadata carries that ID into workers. Never put secrets,
cookies, authorization headers, passwords, national IDs, emails, phone
numbers, raw identifiers, request/response bodies, signed URLs, payment
payloads, exported data, SQL text/bind values, or raw job payloads into a
ticket or bundle.

## Backup and restore integration points

Before each production schema migration:

1. The operator provisions root-only `backup.env`, `PGPASSFILE`, and Restic
   password files, and creates the private Restic repository through the
   approved host process.
2. The release operator invokes the repository gate:

   ```sh
   sudo ./scripts/release-with-backup.sh
   ```

The gate runs `postgres-backup.sh --pre-migration`, which fails before a
migration if it cannot create and remotely list an encrypted Restic snapshot.
Record the resulting snapshot ID, timestamp, and operator in the release
record.

For restore drills, use `postgres-restore.sh` to restore into a separate empty
database explicitly listed in `RESTORE_ALLOWED_DATABASES`. Record backup
reference, start/end time, schema status, approved non-mutating integrity
checks, operator, and pass/fail. The script refuses the configured source
database, any non-allow-listed target, and any non-empty target. Do not use a
Docker PostgreSQL container or volume as a substitute restore target.

## Launch evidence

Before launch, retain evidence that:

- Hourly diagnostic-bundle export works, reports missing host sources in its
  manifest, and contains no private data.
- Host Nginx forwards the required headers to the loopback API and the public
  readiness URL succeeds.
- PostgreSQL is private, allows only the intended Docker network with SCRAM,
  and the application role has only needed privileges.
- The host backup script and isolated restore drill have passed.
- Every migration release records the successful Restic snapshot ID.

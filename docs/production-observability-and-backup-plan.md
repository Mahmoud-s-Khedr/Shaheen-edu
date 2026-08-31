# Production observability and backup plan

**Scope:** the production architecture in
[production-deployment.md](production-deployment.md): Docker Compose runs API,
worker, and Redis; host operations run Nginx and PostgreSQL.

## Ownership and boundaries

| Area | Owner | Repository behavior |
| --- | --- | --- |
| API gateway, API replicas, worker, Redis logs | Repository-managed Docker services | Uses bounded Docker logs and can export an incident bundle. |
| Nginx access/error logs | Host operations | Not collected by Compose or the incident-bundle script. |
| PostgreSQL service, backup scheduling, restore-target creation, retention | Host operations | PostgreSQL remains host-managed; operator controls credentials and schedules. |
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

## Incident logs

The incident-log export script collects only the Docker `api-gateway`, `api`,
`worker`, and `redis` logs, then uploads the restricted bundle to the configured
private Bunny destination. It deliberately cannot include host Nginx or
PostgreSQL logs. The host operator must use its established access-controlled
process for those logs.

```sh
cd /opt/shaheen-edu/deploy/production

# Recent API 5xx records. `jq -R` ignores non-JSON lines safely.
docker compose logs --no-color --no-log-prefix --since 6h api \
  | jq -R 'fromjson? | select(.event == "unhandled_exception")'

# Worker failures and retry exhaustion.
docker compose logs --no-color --no-log-prefix --since 6h worker \
  | jq -R 'fromjson? | select(.event == "queue_job_failed" or .event == "queue_retry_exhausted" or .event == "queue_connection_lost")'

# Restricted Docker-service bundle only.
sudo ./scripts/export-incident-logs.sh 6h
```

Never put secrets, cookies, authorization headers, passwords, national IDs,
emails, phone numbers, full request/response bodies, signed URLs, payment
payloads, exported data, or raw job payloads into a ticket or bundle.

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

- Docker incident-log export works and no private data is present in the
  bundle.
- Host Nginx forwards the required headers to the loopback API and the public
  readiness URL succeeds.
- PostgreSQL is private, allows only the intended Docker network with SCRAM,
  and the application role has only needed privileges.
- The host backup script and isolated restore drill have passed.
- Every migration release records the successful Restic snapshot ID.

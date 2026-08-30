# Production backups and local troubleshooting plan

**Status:** implementation plan
**Scope:** the single production VM described in [production-deployment.md](production-deployment.md), with the API, worker, PostgreSQL, Redis, and Nginx in Docker Compose.
**Target:** recoverable data and a simple, private way to investigate failures. This deliberately does not include a hosted monitoring service.
**Last reviewed:** 2026-08-30

## Decisions and non-goals

This plan fits the first-year single-VM deployment: 2 vCPU, 4 GB RAM, approximately 1,000–5,000 registered users, primarily in Egypt.

It requires one thing outside the application VM: the existing private Bunny
Storage Zone with S3 Compatibility enabled. Application assets, encrypted
PostgreSQL backups, and incident-log bundles share that zone, but operational
objects stay under the reserved `operations/` prefix and must never be exposed
through an application asset endpoint or public URL.

Logs remain in Docker's bounded local log store and are exported to the private
Bunny zone every four hours. During an incident, an authorized operator can
also create an immediate restricted bundle and download it from the Bunny
dashboard for inspection with `lnav`, `jq`, or `rg`. This is intentionally
simpler than operating hosted telemetry, but has clear limits:

- There are no automatic alerts, external uptime checks, dashboards, metrics, or distributed traces.
- A VM loss can lose logs created after the most recent log-export run; it must
  not lose PostgreSQL data because backups are off-host.
- A human must notice an outage or user report, connect to the server, and inspect logs.

Revisit hosted monitoring only after production is stable and the team has the capacity to operate it. Do not install a telemetry database or collector on this VM for this launch.

### Production objectives

| Objective                                 | Initial target                                                                   | How it is proved                             |
| ----------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| Investigate an unexpected backend failure | Find its correlation ID, safe stack, and release within 10 minutes of SSH access | Deliberate staging 500 and local log search. |
| Investigate worker/queue failure          | Find queue and safe job category within 10 minutes of SSH access                 | Controlled failed-job exercise.              |
| PostgreSQL data-loss window (RPO)         | At most 6 hours, plus a pre-migration backup                                     | Timestamp of the latest successful backup.   |
| Full-VM recovery time (RTO)               | At most 4 hours after a replacement VM is available                              | Timed, isolated restore drill.               |

## Part A — local logs and error investigation

### A.1 Data policy

Permitted structured fields are timestamps, level, service, bounded event name, HTTP method, route template, status code, release, queue, safe job category, and correlation ID.

Never write or copy into an incident bundle: secrets, cookies, authorization headers, passwords, national IDs, emails, phone numbers, full request/response bodies, signed URLs, payment payloads, exported CSV data, raw job payloads, or raw error messages that may contain user/provider data.

The API and worker emit JSON Pino records. Unexpected API failures use `event=unhandled_exception` with an `errorFingerprint` and a stack with the potentially sensitive error-message line removed. Worker failures use bounded queue/category fields and never include job payloads. Nginx access logging is disabled so query strings and client IP addresses are not retained in the local bundle.

### A.2 Work plan

- [x] **A1. Bound local Docker logs and identify services**
  - Every production service uses Docker's `local` log driver with a 10-MB file limit and three retained files.
  - Stable Compose service/release labels are set for each service.
  - **Still verify on production:** `docker inspect` shows the policy and `docker compose logs` works after a forced staging rotation.

- [x] **A2. Record safe API and worker failures**
  - API 5xx records include a deterministic fingerprint, sanitized stack, route template, status, release, and correlation ID.
  - Expected 4xx outcomes are non-error records without stacks.
  - Worker startup, connection-loss, job-failure, retry-exhaustion, and bounded completion-summary records are structured JSON.
  - **Still verify:** run one controlled API 500, one 400, and one failed job in staging; confirm no test secret appears in exported logs.

- [x] **A3. Disable Nginx access-log retention and provide an export tool**
  - Nginx writes error output only; it does not retain literal URLs, query strings, or client IP addresses in Docker logs.
  - [`export-incident-logs.sh`](../deploy/production/scripts/export-incident-logs.sh) creates a root-only bundle from approved Compose service logs and the backup-job journal, then uploads its readable files to `operations/incident-logs/` in the private Bunny zone. Its systemd timer runs every four hours.

### A.3 Day-to-day troubleshooting

Run these commands only over SSH on the production VM. Use a terminal session that does not record scrollback to a shared support system.

```sh
cd /opt/shaheen-edu/deploy/production

# Recent API 5xx records. `jq -R` ignores non-JSON lines safely.
docker compose logs --no-color --no-log-prefix --since 6h api \
  | jq -R 'fromjson? | select(.event == "unhandled_exception")'

# Worker failures and retry exhaustion.
docker compose logs --no-color --no-log-prefix --since 6h worker \
  | jq -R 'fromjson? | select(.event == "queue_job_failed" or .event == "queue_retry_exhausted" or .event == "queue_connection_lost")'

# Search a correlation ID returned to a user by the API.
docker compose logs --no-color --since 6h api worker | rg '<correlation-id>'

# Check backup success/failure records.
journalctl -u shaheen-edu-postgres-backup.service --since '24 hours ago' --no-pager
```

For a larger investigation, create and download a restricted bundle. The bundle may still contain operationally sensitive information, so copy it only to an encrypted, access-controlled machine and delete it when the incident is closed.

```sh
sudo /opt/shaheen-edu/deploy/production/scripts/export-incident-logs.sh 6h
# Download the printed operations/incident-logs/ path from the private Bunny dashboard.
# On your own machine: lnav compose.log backup-journal.log
```

First-response sequence: record the time and release, search the API/worker event records, use the correlation ID to see nearby records, identify the affected route or queue, then preserve the bundle before making a change.

### Local-log launch gate

A1–A3 must be production-verified before launch. This is a troubleshooting baseline, not an uptime-monitoring system.

## Part B — backups, restore procedures, and recovery testing

### B.1 Backup design

| Asset                       | Protection                                                                                                 | Notes                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL                  | Compressed logical database dump, encrypted before leaving VM                                              | Stored under `operations/postgres-restic/` in the private Bunny zone; source of truth for users, learning data, financial/audit records, entitlements, and job-state records. |
| PostgreSQL before migration | On-demand encrypted dump                                                                                   | Required immediately before every production schema migration.                                                          |
| Redis                       | AOF, RDB snapshots, configuration capture                                                                  | Contains queues/rate-limit data, not authoritative business records. Recovery must reconcile safe database-backed work. |
| Production configuration    | Encrypted, access-controlled recovery copy of `.env`, Compose files, Nginx config, and deployment revision | Never put plaintext secrets or `.env` files in Git or routine logs.                                                     |
| Application image/source    | Immutable image digest or reviewed commit and lockfile                                                     | Needed to rebuild a replacement VM.                                                                                     |
| Media                       | Verify Bunny Storage/Stream retention separately                                                           | This plan protects database metadata, not provider media durability.                                                    |

Never use a same-VM Docker volume, a live `tar` of PostgreSQL data, an unverified local dump, a dump stored with its sole decryption key, or a backup that has not passed a restore drill.

Use Restic in the existing private Bunny S3-compatible Storage Zone. The script reads the existing root-readable `BUNNY_STORAGE_*` credentials and stores its encrypted repository under `operations/postgres-restic/`. Store the repository password and two offline recovery copies of the decryption material with named custodians. Losing that password makes the backups unusable.

Keep the zone S3-compatible and private, with dashboard access restricted to authorized operators. Bunny S3 has no object versioning, Object Lock, retention policies, lifecycle policies, or write-only Restic credentials. Do not automatically prune from the production VM; perform retention from a separate recovery environment. This shared-bucket approach trades credential and blast-radius isolation for simpler launch operations.

### B.2 Schedule and retention

| Job                           | Schedule                                                       | Success condition                                                                     |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| PostgreSQL logical backup     | Every four hours                                               | Custom dump, checksum, encrypted remote upload, and remote-list confirmation succeed. |
| Pre-migration backup          | Immediately before `prisma migrate deploy`                     | Release cannot continue without remote confirmation.                                  |
| Configuration recovery backup | On approved configuration change; at least weekly              | Encrypted archive exists and an authorized operator can decrypt it.                   |
| Redis recovery capture        | Daily and before Redis maintenance                             | AOF/RDB artifact and Redis config are encrypted remotely.                             |
| Restore drill                 | Weekly initially; monthly after three successful weekly drills | Latest PostgreSQL dump restores in isolation and verification passes.                 |

Keep 35 daily snapshots, 12 monthly snapshots, and the last known-good pre-migration snapshot until the next verified restore. Reassess from actual dump size; do not shorten retention without recorded approval.

### B.3 Work plan

- [ ] **B1. Configure the shared private destination**
  - Verify the existing Bunny zone remains private, restrict dashboard access, reserve the `operations/` prefix for backups/logs, and prove `restic init`, backup, `check`, restore, log upload, and authorized retention from a separate environment.
  - [x] Repository template added: [`backup.env.example`](../deploy/production/backup.env.example).

- [ ] **B2. Install and prove the PostgreSQL backup job**
  - The repository implementation is present: [`postgres-backup.sh`](../deploy/production/scripts/postgres-backup.sh), its [systemd service](../deploy/production/systemd/shaheen-edu-postgres-backup.service), and the [four-hour timer](../deploy/production/systemd/shaheen-edu-postgres-backup.timer).
  - On production, install Restic and the units, initialise the new repository, run a successful backup, then induce an upload failure and confirm it exits non-zero with `backup_failed` in the journal.

- [ ] **B3. Prove the pre-migration backup gate**
  - [`release-with-backup.sh`](../deploy/production/scripts/release-with-backup.sh) runs the remote-confirmed backup before starting the migration container.
  - Run a staging deployment with destination denial; it must stop before migration. Record the snapshot ID for a successful staging migration.

- [ ] **B4. Complete Redis recovery**
  - Redis AOF, RDB snapshots, `REDIS_MAXMEMORY`, and `maxmemory-policy noeviction` are configured in production Compose.
  - Add daily Redis artifact/config capture, implement safe reconciliation of unfinished report exports and question imports, and prove a Redis-reset drill. Never replay payment fulfilment blindly.

- [ ] **B5. Protect recovery configuration and key access**
  - Create the separately encrypted configuration archive, record two key custodians, and conduct an emergency-access tabletop exercise without exposing secrets.

### B.4 Restore procedures

#### Procedure 1 — accidental data damage or bad migration

1. Declare the incident and record the release, time, backup candidates, and last known-good point.
2. Put the API into maintenance/read-only mode or stop API/worker writes.
3. Select a backup by timestamp and checksum. Restore it into a new, isolated PostgreSQL database; do not overwrite live data first.
4. Run `prisma migrate status`, selected table/count checks, and read-only API smoke tests.
5. Obtain approval to switch to the restored database. Preserve the damaged volume where feasible.
6. Start clean Redis, run safe-job reconciliation, deploy the compatible release, verify readiness, re-enable traffic, and record actual data loss.

#### Procedure 2 — complete VM loss

1. Declare the incident. A human or customer report will identify the outage in this simplified setup.
2. Create a replacement VM, apply the hardened OS/Docker/firewall baseline, and expose only 80/443.
3. Retrieve recovery configuration, backup credentials/key, immutable application revision, and latest verified backup ID from independent storage.
4. Deploy PostgreSQL on a fresh volume, restore the selected backup, and run integrity/schema checks before application migrations.
5. Start clean Redis, deploy migrations/API/worker/Nginx, run readiness plus an authenticated smoke test, and reconcile safe queues.
6. Restore DNS/IP, observe local logs and readiness for one hour, create a new backup, and record RTO/RPO.

#### Procedure 3 — routine restore proof

1. On an isolated restore host, retrieve the latest snapshot and verify repository integrity/checksum.
2. Restore to a disposable PostgreSQL database with no public port and no access to production Redis, webhooks, email, or payments.
3. Run `prisma migrate status`, non-mutating database checks, and read-only API smoke tests.
4. Record snapshot ID/timestamp, start/end, size, operator, revision, pass/fail, RPO, and RTO in the release record.
5. Destroy the isolated environment and securely remove plaintext dump files.

### Backup launch gate

All B1–B5 items and one successful Procedure 3 restore drill are mandatory before production launch. A full Procedure 2 VM-loss drill is mandatory before financial/payment features and after material infrastructure changes.

## Release evidence and ownership

Keep the following with each production release: the last three remote snapshot IDs/checksums, each migration's pre-migration snapshot ID, the latest restore-drill result, Redis recovery-drill result, and the verified local-log troubleshooting exercise.

| Area                                          | Primary owner          | Backup owner                         | Review cadence                 |
| --------------------------------------------- | ---------------------- | ------------------------------------ | ------------------------------ |
| Local log policy and incident bundles         | Engineering            | Operations                           | Before any logging change      |
| Backup destination and encryption-key custody | Operations             | Named business/engineering custodian | Quarterly access test          |
| Backup job and restore drills                 | Engineering            | Operations                           | Weekly initially; then monthly |
| Financial-data restore authorization          | Business/finance owner | Engineering lead                     | Per incident                   |

## Implementation note

This document is a plan, not evidence that the controls exist. The repository assets must be installed and proven on the production VM before their checklist items are complete.

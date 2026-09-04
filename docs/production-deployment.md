# Production deployment

Production is intentionally split between repository-managed Docker services
and existing host automation:

| Owner | Responsibilities |
| --- | --- |
| This repository / Docker Compose | Private `api` replicas behind an internal gateway, `worker`, Redis, and explicit `migrate`/`bootstrap` jobs. |
| Host operations | Nginx domains, TLS certificates and renewal, public listener, reverse proxy, PostgreSQL, backup credential custody, restore-target creation, and host firewall. |
| Test VPS only | A dedicated database, database role, domain, Bunny credentials, backup destination, and all other test credentials. Never promote any of these to production. |

Docker Compose does **not** run the public Nginx, Certbot, or PostgreSQL in
production. It runs a private Nginx gateway solely to distribute traffic over
scaled API containers. That gateway is published only as
`127.0.0.1:${API_HOST_PORT:-13000}:8080`; API containers and Redis have no
published port.

## Host prerequisites

Complete these through the operator's existing host-management automation
before starting Compose. This repository neither provisions nor modifies them.

1. Host Nginx owns the production domain, TLS certificate and renewal, and a
   TLS virtual host on the approved external port (the example uses `3000`).
   Permit that external TLS port in the host firewall. Do not expose Docker's
   API port, Redis, or PostgreSQL publicly.
2. Host PostgreSQL has a dedicated database and least-privileged application
   role. It is not publicly reachable; it listens only on the necessary local
   and Docker-bridge interface(s), not `0.0.0.0` or a public interface.
3. The host's PostgreSQL access policy permits only the intended Compose
   network/subnet to that database and role, using password/SCRAM
   authentication (for example, a scoped `pg_hba.conf` rule with
   `scram-sha-256`). Identify the actual subnet from the deployed Compose
   network and keep it out of broad/private-network allow rules. Do not commit
   database or application secrets.
4. Docker Engine supports `host-gateway` (Docker 20.10+). Compose maps
   `host.docker.internal` to that gateway for API, worker, migration, and
   bootstrap containers. Set `DATABASE_URL` to that hostname, never to a
   Compose `postgres` service. Percent-encode reserved characters in URL
   credentials.
5. Host `pg_dump`, `psql`, `pg_restore`, and `restic` are installed. Configure
   the repository's root-only host-backup environment and test a restore into
   a disposable database before the first migration. PostgreSQL provisioning,
   role management, backup credential custody, and restore-target creation
   remain host-operator responsibilities.

## Configure and launch

Copy [`deploy/production/.env.example`](../deploy/production/.env.example) to
`deploy/production/.env` in the host secret manager, set mode `0600`, and
complete every placeholder with production values. `DATABASE_URL` is the
explicit host-PostgreSQL connection string, and `API_HOST_PORT` defaults to
`13000` so it cannot conflict with host Nginx on `3000`.

```sh
cd /opt/shaheen-edu/deploy/production
cp .env.example .env
chmod 0600 .env
editor .env
docker compose --env-file .env config --quiet
docker compose up -d --wait redis
docker compose build migrate api worker
```

For a new, empty host database, run the migration once. Normal release
migrations invoke the repository's host-PostgreSQL backup script first and
stop if its encrypted remote backup cannot be created and listed:

```sh
sudo ./scripts/release-with-backup.sh
```

The backup script calls host `pg_dump` through root-only libpq configuration,
then writes an encrypted Restic snapshot to the configured private Bunny
destination. It never starts, stops, installs, or configures PostgreSQL.

Run bootstrap exactly once for a new database after the migration job has
completed. The bootstrap job takes the same database advisory lock as the
migration job and refuses to run unless Prisma reports that every repository
migration is applied, the history is non-divergent, and no migration is active.
Set the approved bootstrap values, run the job, then remove those credentials
from the deployed environment before starting long-running services:

```sh
editor .env
docker compose --profile bootstrap run --rm bootstrap
editor .env
# Choose the API replica count for this host. Workers stay at one replica
# unless their concurrency and idempotency have been separately reviewed.
docker compose up -d --wait --scale api=3
```

Install the host-Nginx virtual host through the existing host automation. The
repository's [example](../deploy/production/nginx/default.conf.template) is a
reference only; it deliberately contains no certificate path or TLS-renewal
configuration. Its required proxy headers are `Host`, `X-Real-IP`,
`X-Forwarded-For`, `X-Forwarded-Proto https`, and, when needed,
`X-Forwarded-Port`. The internal Compose gateway adds one controlled proxy
hop, so keep `TRUST_PROXY_HOPS=2`.

```nginx
server {
    listen 3000 ssl;
    server_name <api-domain>;
    # TLS/certificate directives are supplied by host automation.
    location / {
        proxy_pass http://127.0.0.1:13000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port $server_port;
    }
}
```

Verify the public path and private worker path:

```sh
curl --fail-with-body "https://<api-domain>:3000/health/ready"
docker compose ps
docker compose exec worker node -e "fetch('http://127.0.0.1:3001/health/ready').then(r => process.exit(r.ok ? 0 : 1))"
```

## Release and recovery controls

Deploy immutable reviewed revisions only. Before every schema migration,
`release-with-backup.sh` creates a remote-confirmed encrypted host PostgreSQL
backup. Restore drills and backup retention remain host-operator
responsibilities; the repository provides no PostgreSQL provisioning or
automatic backup schedule.
The Compose gateway and Redis images are pinned by digest; update those
digests only as part of a reviewed release and rerun the rehearsal afterwards.

### Host PostgreSQL backup and restore scripts

Create root-only `/etc/shaheen-edu/backup.env` from
[`backup.env.example`](../deploy/production/backup.env.example), and
`/etc/shaheen-edu/backup-storage.env` from
[`backup-storage.env.example`](../deploy/production/backup-storage.env.example),
both with mode `0600`. They name the local host database, a least-privileged
dump/restore role, a root-only `PGPASSFILE`, the Restic password file, a
dedicated private backup destination, and the local staging directory. Do not
reuse the application asset credentials for backups. No password belongs in a
command line or committed file.

Run a manual encrypted backup with:

```sh
sudo ./scripts/postgres-backup.sh --manual
```

`postgres-restore.sh` validates the dump checksum recorded in the snapshot,
then restores only to an empty database named explicitly in
`RESTORE_ALLOWED_DATABASES`; it refuses the configured source/production
database and has no overwrite mode. Create that disposable restore database
through host automation, then run:

```sh
sudo ./scripts/postgres-restore.sh \
  --snapshot <restic-snapshot-or-latest> \
  --target-database <allow-listed-empty-database> \
  --confirm-target <same-database>
```

Every successful backup also applies the configured 14-daily, 8-weekly, and
12-monthly Restic retention policy (override those values only through the
root-only backup environment). After one successful manual backup and isolated
restore proof, operators may install the included four-hour backup unit/timer
and weekly `shaheen-edu-postgres-backup-verify` unit/timer through their normal
host-systemd change process. The weekly unit reads a sample of encrypted remote
pack data; it complements, but does not replace, a restore drill.

### What is and is not restored

PostgreSQL is the system of record and the only database restored from this
runbook. The Compose Redis volume uses AOF/RDB persistence to survive normal
container restarts, but Redis includes leases, rate-limit counters, and BullMQ
queue state; restoring an old Redis snapshot can revive stale work. For a
host-loss recovery, create a fresh Redis volume and, before API/worker traffic
resumes, run the explicit recovery profile below. It refuses a non-empty Redis
database, moves interrupted durable work back to `QUEUED` in PostgreSQL, and
repopulates the two BullMQ queues. If the recovery process is interrupted, its
private marker makes the same command safe to repeat before API/worker traffic
is resumed. Do not treat Redis as the authoritative backup source.

```sh
# API and worker must be stopped; Redis must be a new, empty volume.
docker compose stop api worker
docker compose --profile queue-recovery run --rm queue-recovery
docker compose up -d --wait --scale api=3
```

Assets and video objects live in Bunny, outside PostgreSQL and Redis. Their
recovery policy must be configured separately in Bunny: use a distinct private
backup Storage Zone for Restic, prevent lifecycle deletion of the operations
prefix, and retain or replicate production asset/video objects according to the
business retention policy. A successful database backup alone does not protect
those objects.

The repository retains the incident-log export service/timer for Docker API
gateway, API replica, worker, and Redis logs only. Host Nginx and PostgreSQL
logs are collected by the operator's established process. See
[production observability and backup plan](production-observability-and-backup-plan.md)
and complete the [test-VPS rehearsal](test-vps-production-rehearsal.md) before
production launch.

### Migration history baseline

The generated baseline migration `20260830000000_baseline` is for a new,
empty database. Do not deploy it to a database that already records superseded
migrations in `_prisma_migrations`; use an operator-approved backup and a
rehearsed fresh-database/data-restore cutover. Do not edit migration history
on a live database merely to make the baseline appear applied.

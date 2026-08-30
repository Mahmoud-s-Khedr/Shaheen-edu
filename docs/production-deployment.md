# Production deployment

This is the supported single-host production baseline. It is separate from
`deploy/test-server`; do not promote the test stack or its credentials.

## Before first launch

1. Store a completed `deploy/production/.env` in the production secret manager,
   set its filesystem mode to `0600`, and never commit it.
   Set `RELEASE_REVISION` to the immutable commit or image revision being
   deployed, and set `REDIS_MAXMEMORY` to a reviewed value below the VM memory
   budget (for the 4-GB baseline, start at `768mb` and tune from metrics).
2. Point `API_DOMAIN` DNS at the server and allow inbound TCP 80 and 443 only.
   PostgreSQL, Redis, and application ports must remain private.
3. From `deploy/production`, create a temporary certificate in the persistent
   Certbot volume, start the stack, then replace it with the real certificate:

   ```sh
   set -a && . ./.env && set +a
   docker volume create shaheen-edu-production_certbot_conf
   docker run --rm \
     -v shaheen-edu-production_certbot_conf:/etc/letsencrypt \
     alpine:3.20 sh -c 'apk add --no-cache openssl && mkdir -p /etc/letsencrypt/live/'"$API_DOMAIN"' && openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj /CN='"$API_DOMAIN"' -keyout /etc/letsencrypt/live/'"$API_DOMAIN"'/privkey.pem -out /etc/letsencrypt/live/'"$API_DOMAIN"'/fullchain.pem'
   # A brand-new, empty database is the sole permitted no-backup migration.
   docker compose build migrate
   docker compose --profile migration run --rm migrate
   docker compose up -d --build --wait
   docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
     -d "$API_DOMAIN" --email <operations-email> --agree-tos --no-eff-email
   docker compose exec nginx nginx -s reload
   ```

   Confirm that DNS and port 80 are reachable before requesting the real
   certificate. The temporary certificate is only a bootstrap step.

4. Run the bootstrap profile exactly once for a new database. Before doing so,
   set `ALLOW_PRODUCTION_BOOTSTRAP=true` and the two approved
   `INITIAL_REFUND_*` values, then run
   `docker compose --profile bootstrap run --rm bootstrap`. Reset the
   acknowledgement to `false` immediately afterwards.
   Normal releases run migrations only and never seed financial data.
5. Verify `https://<API_DOMAIN>/health/ready`, the worker health status, signed
   Bunny upload/playback webhook flow, Paymob callback HMAC flow, and the full
   staging acceptance suite before enabling any feature flag.

## Release and recovery controls

- Deploy only an immutable reviewed commit or image digest. Take and verify an
  encrypted, off-host PostgreSQL backup before every migration and every four
  hours. The backup implementation and restore procedure are in
  [production-observability-and-backup-plan.md](production-observability-and-backup-plan.md).
- Do not enable a production migration until the Bunny backup job has passed
  its remote-upload and restore checks. For a release containing a migration,
  build the release image, then run the root-owned gate below before bringing
  up the release. It exits non-zero if the remote encrypted snapshot cannot be
  created and listed.

  ```sh
  cd /opt/shaheen-edu/deploy/production
  docker compose build migrate api worker
  sudo ./scripts/release-with-backup.sh
  docker compose up -d --wait
  ```

  The first deployment of a brand-new, empty database is the only exception;
  complete the backup setup immediately after that initial migration and before
  accepting production data. Do not bypass the gate for later releases.

### Migration history baseline

The repository intentionally contains one generated baseline migration,
`20260830000000_baseline`, representing the current `schema.prisma`. It is for
a new, empty database. Do not deploy this compacted history to a database that
already records the superseded migrations in `_prisma_migrations`: take a
verified backup and rehearse a fresh-database/data-restore cutover instead.
Never delete or edit migration-history records on a live database merely to
make this baseline appear applied.

- Do not roll back application code across a completed schema migration unless
  compatibility has been reviewed. Prefer a forward fix or a tested restore.
- Keep finance/referral/export feature flags disabled until their explicit
  rollout approvals, allow-lists, reconciliation, and rollback owners exist.
- The API and worker both expose container-local readiness endpoints. A worker
  that loses BullMQ readiness becomes unhealthy instead of silently consuming
  no jobs.

Local log investigation is documented in
[production-observability-and-backup-plan.md](production-observability-and-backup-plan.md).
This launch baseline does not include dashboards, automatic alerting, or
external uptime monitoring.

## Bunny PostgreSQL backup installation

This repository uploads encrypted PostgreSQL backups and readable incident-log
bundles to the same private Bunny Storage Zone used for application assets.
They are stored below the reserved `operations/` prefix; application code must
never issue asset URLs for that prefix. Provisioning and the first remote
restore still require production credentials and remain an operations task.

1. Confirm that the existing application Storage Zone has S3 Compatibility
   enabled, remains private, and that access to the Bunny dashboard is limited
   to authorized operators. Do not expose `operations/` through a public URL
   or an asset-download endpoint.
2. On the host, install a current `restic` package and create the root-only
   secret files. For Debian/Ubuntu hosts:

   ```sh
   sudo apt-get update && sudo apt-get install -y restic awscli
   sudo install -d -m 0700 /etc/shaheen-edu /var/lib/shaheen-edu-backups/staging /var/cache/shaheen-edu-restic /var/lib/shaheen-edu-incident-logs
   sudo install -m 0600 /opt/shaheen-edu/deploy/production/backup.env.example /etc/shaheen-edu/backup.env
   sudoedit /etc/shaheen-edu/backup.env
   sudoedit /etc/shaheen-edu/restic-password
   sudo chmod 0600 /etc/shaheen-edu/restic-password
   ```

   Set `BUNNY_STORAGE_ENV_FILE` to the root-readable production `.env` and
   leave `OPERATIONS_PREFIX=operations`. The backup script derives its Restic
   repository as `operations/postgres-restic` in the existing Bunny bucket,
   using the existing `BUNNY_STORAGE_*` S3 credentials.

3. Initialise the encrypted Restic repository exactly once, then run the
   backup manually. Do not run `restic init` against an existing repository.

   ```sh
   sudo bash -c 'set -a; . /opt/shaheen-edu/deploy/production/.env; . /etc/shaheen-edu/backup.env; set +a; export AWS_ACCESS_KEY_ID="$BUNNY_STORAGE_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$BUNNY_STORAGE_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto; export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-s3:${BUNNY_STORAGE_S3_ENDPOINT%/}/${BUNNY_STORAGE_BUCKET}/${OPERATIONS_PREFIX:-operations}/postgres-restic}"; restic init'
   sudo chmod 0750 /opt/shaheen-edu/deploy/production/scripts/postgres-backup.sh /opt/shaheen-edu/deploy/production/scripts/release-with-backup.sh /opt/shaheen-edu/deploy/production/scripts/export-incident-logs.sh
   sudo /opt/shaheen-edu/deploy/production/scripts/postgres-backup.sh --scheduled
   sudo journalctl -n 50 --no-pager | grep 'backup_completed'
   ```

4. Only after that manual run is visible in Bunny and has been restored into an
   isolated environment, install and enable the timer:

   ```sh
   sudo install -m 0644 /opt/shaheen-edu/deploy/production/systemd/shaheen-edu-postgres-backup.service /etc/systemd/system/
   sudo install -m 0644 /opt/shaheen-edu/deploy/production/systemd/shaheen-edu-postgres-backup.timer /etc/systemd/system/
   sudo install -m 0644 /opt/shaheen-edu/deploy/production/systemd/shaheen-edu-incident-log-upload.service /etc/systemd/system/
   sudo install -m 0644 /opt/shaheen-edu/deploy/production/systemd/shaheen-edu-incident-log-upload.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemd-analyze verify /etc/systemd/system/shaheen-edu-postgres-backup.service /etc/systemd/system/shaheen-edu-postgres-backup.timer /etc/systemd/system/shaheen-edu-incident-log-upload.service /etc/systemd/system/shaheen-edu-incident-log-upload.timer
   sudo systemctl enable --now shaheen-edu-postgres-backup.timer shaheen-edu-incident-log-upload.timer
   systemctl list-timers 'shaheen-edu-*'
   ```

Backups remain Restic-encrypted, so their Bunny dashboard objects are not
directly restorable without the Restic password. Incident-log bundle files are
uploaded as readable objects under `operations/incident-logs/` for dashboard
download. The scripts deliberately do not run `restic forget --prune`: Bunny
S3 has no object versioning or Object Lock, so automatic deletion from the VM
would make account/VM compromise more damaging.

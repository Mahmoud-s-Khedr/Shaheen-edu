# Production deployment rehearsal on a test VPS

This is the complete launch rehearsal for one small, single-host deployment.
It deliberately uses the production Compose stack, not `deploy/test-server`.
It proves the only operational capabilities needed at launch: start clean,
secure traffic, take and restore an off-host database backup, and retrieve
searchable error logs.

Use a disposable VPS and a dedicated subdomain such as
`api-staging.example.com`. Point its DNS A/AAAA record to the VPS before the
certificate step. Use separate staging Bunny Storage/Stream credentials and
never copy production customer data or credentials onto this machine.

## 1. Prepare the VPS

Use a current supported Linux VPS with Docker Engine and the Docker Compose
plugin installed. Give the operator SSH access and allow inbound TCP 22, 80,
and 443 only. Do not publish PostgreSQL, Redis, or port 3000.

Clone the reviewed revision and make the deployment directory root-readable:

```sh
sudo mkdir -p /opt
sudo git clone <your-repository-SSH-URL> /opt/shaheen-edu
sudo git -C /opt/shaheen-edu checkout <reviewed-commit-sha>
sudo chown -R "$USER":root /opt/shaheen-edu
cd /opt/shaheen-edu/deploy/production
```

Copy the production template and edit it locally on the VPS. Generate each
application/database secret with `openssl rand -base64 48`; do not reuse the
template values. Set `API_DOMAIN`, `CORS_ORIGINS`, `RELEASE_REVISION`, and the
dedicated Bunny credentials.

```sh
cp .env.example .env
chmod 0600 .env
editor .env
docker compose --env-file .env config --quiet
```

The final command must exit successfully. It is a safe way to catch missing
variables before containers or data volumes are created.

## 2. Start a clean production-shaped stack

Create a one-day temporary TLS certificate. This lets Nginx start and serve
the ACME challenge before Certbot obtains the real certificate.

```sh
set -a && . ./.env && set +a
docker volume create shaheen-edu-production_certbot_conf
docker run --rm -e DOMAIN="$API_DOMAIN" \
  -v shaheen-edu-production_certbot_conf:/etc/letsencrypt \
  alpine:3.20 sh -ec '
    apk add --no-cache openssl
    mkdir -p "/etc/letsencrypt/live/$DOMAIN"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -subj "/CN=$DOMAIN" \
      -keyout "/etc/letsencrypt/live/$DOMAIN/privkey.pem" \
      -out "/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  '

docker compose up -d --wait postgres redis
docker compose build migrate api worker
docker compose --profile migration run --rm migrate
```

For this new, empty database only, bootstrap the test administrator and refund
policy. Temporarily set `ALLOW_PRODUCTION_BOOTSTRAP=true` in `.env`, run the
profile once, then change it back to `false` before continuing.

```sh
editor .env
docker compose --profile bootstrap run --rm bootstrap
editor .env
docker compose up -d --wait
```

Obtain the real certificate only after DNS resolves to this VPS and port 80 is
reachable from the Internet:

```sh
set -a && . ./.env && set +a
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d "$API_DOMAIN" --email <operations-email> --agree-tos --no-eff-email
docker compose exec nginx nginx -s reload
curl --fail-with-body "https://$API_DOMAIN/health/ready"
docker compose ps
```

Every long-running service must show healthy. Check the worker from inside its
private network rather than exposing its health port:

```sh
docker compose exec worker node -e "fetch('http://127.0.0.1:3001/health/ready').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1) })"
```

## 3. Install and prove backups

Install `restic` and the AWS CLI using your VPS distribution's packages. Set
up the root-only files and directories below. The Bunny Storage Zone must be
private and distinct from the production zone.

```sh
sudo install -d -m 0700 /etc/shaheen-edu \
  /var/lib/shaheen-edu-backups/staging \
  /var/cache/shaheen-edu-restic \
  /var/lib/shaheen-edu-incident-logs
sudo install -m 0600 backup.env.example /etc/shaheen-edu/backup.env
sudoedit /etc/shaheen-edu/backup.env
sudoedit /etc/shaheen-edu/restic-password
sudo chmod 0600 /etc/shaheen-edu/restic-password
```

Initialize the dedicated Restic repository exactly once, then make a backup.
Use the commands from the shell where `.env` is root-readable:

```sh
sudo bash -c 'set -a; . /opt/shaheen-edu/deploy/production/.env; . /etc/shaheen-edu/backup.env; set +a; export AWS_ACCESS_KEY_ID="$BUNNY_STORAGE_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$BUNNY_STORAGE_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto; export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-s3:${BUNNY_STORAGE_S3_ENDPOINT%/}/${BUNNY_STORAGE_BUCKET}/${OPERATIONS_PREFIX:-operations}/postgres-restic}"; restic init'
sudo /opt/shaheen-edu/deploy/production/scripts/postgres-backup.sh --scheduled
sudo journalctl -u shaheen-edu-postgres-backup.service -n 30 --no-pager
```

The backup command must end with `backup_completed` and a snapshot ID. Confirm
the snapshot also exists in the private Bunny destination.

### Restore proof

Restore the snapshot to a disposable, non-networked PostgreSQL container. The
following commands only remove the explicitly named rehearsal container and
volume at the end; they never touch the production-shaped Compose volume.

```sh
sudo bash -c 'set -a; . /opt/shaheen-edu/deploy/production/.env; . /etc/shaheen-edu/backup.env; set +a; export AWS_ACCESS_KEY_ID="$BUNNY_STORAGE_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$BUNNY_STORAGE_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto; export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-s3:${BUNNY_STORAGE_S3_ENDPOINT%/}/${BUNNY_STORAGE_BUCKET}/${OPERATIONS_PREFIX:-operations}/postgres-restic}"; restore_dir=$(mktemp -d /var/lib/shaheen-edu-backups/restore.XXXXXX); restic restore latest --target "$restore_dir"; find "$restore_dir" -name database.dump -type f -print'
```

Copy the printed dump path to `DUMP_PATH`, then restore it:

```sh
export DUMP_PATH=<printed-path-to-database.dump>
docker volume create shaheen-edu-rehearsal-restore-pgdata
docker run -d --name shaheen-edu-rehearsal-restore-db --network none \
  -e POSTGRES_USER=restore -e POSTGRES_PASSWORD=restore-only-password \
  -e POSTGRES_DB=restore -v shaheen-edu-rehearsal-restore-pgdata:/var/lib/postgresql/data \
  -v "$DUMP_PATH:/backup/database.dump:ro" postgres:16-alpine
until docker exec shaheen-edu-rehearsal-restore-db pg_isready -U restore -d restore; do sleep 1; done
docker exec shaheen-edu-rehearsal-restore-db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --exit-on-error --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" /backup/database.dump'
docker exec shaheen-edu-rehearsal-restore-db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --command "SELECT arabic_normalize('"'"'ﻣﺪﺭﺳﺔ'"'"'), count(*) FROM \"User\";"'
docker rm -f shaheen-edu-rehearsal-restore-db
docker volume rm shaheen-edu-rehearsal-restore-pgdata
```

Record the snapshot ID, start/end times, row-check result, and operator. Only
after this passes, install and enable the repository's two systemd timers:

```sh
sudo install -m 0644 systemd/shaheen-edu-postgres-backup.service /etc/systemd/system/
sudo install -m 0644 systemd/shaheen-edu-postgres-backup.timer /etc/systemd/system/
sudo install -m 0644 systemd/shaheen-edu-incident-log-upload.service /etc/systemd/system/
sudo install -m 0644 systemd/shaheen-edu-incident-log-upload.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now shaheen-edu-postgres-backup.timer shaheen-edu-incident-log-upload.timer
systemctl list-timers 'shaheen-edu-*'
```

## 4. Prove incident logs are useful

First, create an expected client error and find its correlation ID in the API
logs. This proves the normal support workflow without exposing customer data.

```sh
export CORRELATION_ID=rehearsal-$(date +%s)
curl -i -H "x-correlation-id: $CORRELATION_ID" -H 'content-type: application/json' \
  --data '{"email":"missing@example.test","password":"not-the-password"}' \
  "https://$API_DOMAIN/api/v1/auth/admins/login"
docker compose logs --no-color --since 10m api | rg "$CORRELATION_ID"
```

For a deliberate API 500, stop only PostgreSQL, repeat the same request, then
immediately start PostgreSQL and wait for readiness. This is safe on the empty
test VPS; never do it against live users.

```sh
docker compose stop postgres
curl -i --max-time 20 -H "x-correlation-id: $CORRELATION_ID-db-down" \
  -H 'content-type: application/json' \
  --data '{"email":"missing@example.test","password":"not-the-password"}' \
  "https://$API_DOMAIN/api/v1/auth/admins/login" || true
docker compose start postgres
until curl --fail --silent "https://$API_DOMAIN/health/ready" >/dev/null; do sleep 2; done
docker compose logs --no-color --since 10m api | jq -R 'fromjson? | select(.event == "unhandled_exception")'
sudo ./scripts/export-incident-logs.sh 30m
```

Download the printed `operations/incident-logs/` object only from the private
Bunny dashboard, inspect it on an encrypted operator machine, and then remove
the local bundle after the rehearsal.

## 5. Pass/fail record

The rehearsal passes only when all of these are true:

- Clean migration, one-time bootstrap, API readiness, worker readiness, and
  HTTPS health check passed.
- The newest backup has a remote snapshot ID and restored into a separate
  PostgreSQL instance.
- A correlation ID and a deliberate 500 were found in the incident log bundle.
- Both systemd timers are enabled and show their next run.
- `ALLOW_PRODUCTION_BOOTSTRAP=false`, API documentation remains disabled, and
  revenue/referral/report flags remain disabled.

Destroy the test VPS and its Bunny test resources after recording the result.
Do not promote its database volume, `.env`, backup password, or certificates
to production.

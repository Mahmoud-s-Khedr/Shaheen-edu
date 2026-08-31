# Production deployment rehearsal on a test VPS

Use a disposable VPS, dedicated subdomain (for example
`api-staging.example.com`), and test-only credentials. The rehearsal follows
the production architecture exactly: host Nginx and host PostgreSQL are
managed through the operator's existing automation; Docker Compose runs only
the API, worker, Redis, migration, and bootstrap jobs. Do not copy production
data, credentials, certificates, or backups to this VPS.

## 1. Prepare host-managed dependencies

Before Docker is started, the operator must use the existing host automation
to provide all of the following:

- A test-only TLS virtual host on `https://<test-domain>:3000`, with the domain,
  certificate, and renewal managed by host Nginx. Configure it to proxy to
  `http://127.0.0.1:13000` and send `Host`, `X-Real-IP`,
  `X-Forwarded-For`, `X-Forwarded-Proto https`, and `X-Forwarded-Port`.
- A new, dedicated host PostgreSQL database and least-privileged test role.
  PostgreSQL must not be public; it may listen only on the required local and
  Docker-bridge interfaces. Its `pg_hba.conf` policy must allow only the
  intended Compose subnet with SCRAM/password authentication.
- A separate test backup destination plus host `pg_dump`, `psql`, `pg_restore`,
  and `restic`. Configure the repository's root-only `backup.env` and password
  files with test-only credentials. No Docker PostgreSQL volume, temporary
  Docker TLS certificate, Docker Certbot, or Docker Nginx is used.

Clone the reviewed revision and create a test-only `.env`:

```sh
sudo mkdir -p /opt
sudo git clone <your-repository-SSH-URL> /opt/shaheen-edu
sudo git -C /opt/shaheen-edu checkout <reviewed-commit-sha>
sudo chown -R "$USER":root /opt/shaheen-edu
cd /opt/shaheen-edu/deploy/production
cp .env.example .env
chmod 0600 .env
editor .env
docker compose --env-file .env config --quiet
```

Use a test-only `DATABASE_URL` with `host.docker.internal` as its host. The
production Compose file adds the explicit Linux `host-gateway` mapping. Set
`API_HOST_PORT=13000` (or another unused loopback port), `API_DOMAIN`, CORS,
release revision, `REDIS_MAXMEMORY`, and a larger `REDIS_MEMORY_LIMIT`; use
separate test Bunny credentials. Keep
`ALLOW_PRODUCTION_BOOTSTRAP=false` initially.

## 2. Start a clean production-shaped deployment

Start only Docker Redis, build the application images, and migrate the new
host database. A brand-new dedicated test database is the sole case where the
initial migration is allowed before a backup exists.

```sh
docker compose up -d --wait redis
docker compose build migrate api worker
docker compose --profile migration run --rm migrate
```

For this new database only, set `ALLOW_PRODUCTION_BOOTSTRAP=true` and the
approved test bootstrap values. Run bootstrap once, then return the setting to
`false` before launching API and worker:

```sh
editor .env
docker compose --profile bootstrap run --rm bootstrap
editor .env
docker compose up -d --wait --scale api=3
```

Verify that the API cannot be reached publicly except through host Nginx, then
verify the public and worker readiness paths:

```sh
curl --fail-with-body "https://<test-domain>:3000/health/ready"
docker compose exec worker node -e "fetch('http://127.0.0.1:3001/health/ready').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1) })"
docker compose ps
```

Only `api-gateway` may show `127.0.0.1:<API_HOST_PORT>`; API replicas and
Redis must show no published port. Confirm three healthy API containers are
running. `TRUST_PROXY_HOPS` is `2` because the controlled internal gateway is
the second proxy hop after host Nginx.

## 3. Prove host PostgreSQL backup and restore

Create an encrypted backup of this dedicated host test database and record its
snapshot reference, start/end time, and operator. Before any later rehearsal
migration, the release gate runs the same backup script automatically:

```sh
sudo ./scripts/postgres-backup.sh --manual
sudo ./scripts/release-with-backup.sh
```

For restore proof, create a separate empty test database through host
automation, list it in `RESTORE_ALLOWED_DATABASES`, and run the host restore
script. Do not use a Docker PostgreSQL restore container.

```sh
sudo ./scripts/postgres-restore.sh \
  --snapshot <restic-snapshot-or-latest> \
  --target-database <allow-listed-empty-database> \
  --confirm-target <same-database>
```

Confirm schema status and approved non-mutating row/readiness checks, record
the result, then dispose of the restore target through host automation.

## 4. Prove useful Docker incident logs

Create an expected client error, search for its correlation ID in API logs,
and export the repository-managed Docker log bundle. Host Nginx and PostgreSQL
logs remain outside this bundle.

```sh
export CORRELATION_ID=rehearsal-$(date +%s)
curl -i -H "x-correlation-id: $CORRELATION_ID" -H 'content-type: application/json' \
  --data '{"email":"missing@example.test","password":"not-the-password"}' \
  "https://<test-domain>:3000/api/v1/auth/admins/login"
docker compose logs --no-color --since 10m api | rg "$CORRELATION_ID"
sudo ./scripts/export-incident-logs.sh 30m
```

## 5. Pass/fail record

The rehearsal passes only when the following are recorded:

- The new dedicated host database migrated; bootstrap ran once; and
  `ALLOW_PRODUCTION_BOOTSTRAP=false` afterwards.
- API and worker are healthy; the API is reachable through
  `https://<test-domain>:3000/health/ready`; only the Docker gateway port is
  loopback-only; API replicas and Redis have no host port.
- The test host-Nginx headers and TLS behavior are verified.
- The repository backup script produced a Restic snapshot reference and the
  restore script successfully restored it to an isolated test target.
- A correlation ID was found in the Docker API log bundle.

Destroy the test VPS and test-only host resources after recording the result.

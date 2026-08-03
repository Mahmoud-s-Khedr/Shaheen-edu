# Test server deployment and operations

This runbook deploys the Shaheen Edu API as a shared, **non-production**
environment for frontend integration. It uses Docker Compose, Nginx, Let's
Encrypt/Certbot, PostgreSQL, and Redis. The API is reachable at
`https://<API_DOMAIN>`; Postgres, Redis, and port 3000 are private to Docker.

Do not use this stack for production data or production Bunny credentials.

## What is deployed

`deploy/test-server/docker-compose.yml` creates these services:

| Service | Purpose | Public |
| --- | --- | --- |
| `nginx` | TLS termination and API proxy | Ports 80 and 443 only |
| `api` | NestJS/Fastify API runtime | No |
| `migrate` | Applies Prisma migrations and runs the idempotent seed once per release | No |
| `postgres`, `redis` | Isolated test data and rate-limit state | No |
| `certbot` | On-demand certificate issue/renewal operation | No |

The migration service must finish successfully before the API starts. API
restarts do not seed the database again.

## Server prerequisites

Use a supported Linux server with Docker Engine, Docker Compose v2, Git,
OpenSSL, and an account able to run Docker. Install them using your operating
system's supported packages. Create a non-root deploy account, add it to the
`docker` group, and grant it repository access with a read-only deploy key.

Before the first deployment:

1. Point both the `A` record (and `AAAA`, if used) for `API_DOMAIN` to the
   server. Confirm it with `dig +short <API_DOMAIN>`.
2. Allow inbound TCP ports **80** and **443** in the cloud security group and
   server firewall. Do not expose 3000, 5432, or 6379.
3. Clone the repository into a stable deployment directory and check out a
   specific reviewed tag or commit rather than tracking an unreviewed branch.

```sh
git clone <repository-url> shaheen-edu
cd shaheen-edu
git checkout <reviewed-tag-or-commit>
cp deploy/test-server/.env.example deploy/test-server/.env
chmod 600 deploy/test-server/.env
cd deploy/test-server
```

## Configure secrets and integrations

Edit `deploy/test-server/.env` on the server only. It is intentionally not
committed. Replace every `replace-...` value and set `API_DOMAIN` plus each
exact frontend URL in `CORS_ORIGINS`. Include local frontend addresses only
when developers need them, for example `http://localhost:5173`.

Generate each application secret independently; do not reuse passwords or
commit output:

```sh
openssl rand -base64 48
```

Set a unique long `POSTGRES_PASSWORD` and `SUPER_ADMIN_PASSWORD` as well.
Keep a protected copy of the completed environment file in the team's secret
manager. The national-ID keys and Bunny credentials cannot be recovered from
the database or source code.

### Browser authentication and CORS

The app accepts credentialed CORS requests only from the comma-separated,
exact origins in `CORS_ORIGINS`; wildcard origins are incompatible with browser
cookies. This test stack sets:

```dotenv
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

That is required when the frontend uses an unrelated domain or `localhost`.
The frontend must call the API with credentials enabled (for example,
`fetch(url, { credentials: 'include' })`). All non-local browser origins must
use HTTPS. For a same-site frontend, `COOKIE_SAME_SITE=lax` is the more
restrictive alternative.

### Bunny configuration

Use dedicated non-production Bunny Storage and Stream resources. Configure
the variables in the Bunny section of the environment file as described in
[`docs/bunny-integration.md`](docs/bunny-integration.md). In Bunny Stream,
configure this public callback URL and allow every frontend hostname used for
video playback:

```text
https://<API_DOMAIN>/api/v1/integrations/bunny-stream/webhook
```

Do not put Bunny API keys in frontend code.

## First HTTPS deployment

Nginx requires a certificate path at startup, while Certbot needs Nginx to
serve the ACME webroot. Create a temporary certificate in the persistent
Certbot volume, start the stack, then replace it with the real certificate.
Run these commands from `deploy/test-server` after `.env` is complete.

```sh
set -a && . ./.env && set +a
docker volume create shaheen-edu-test_certbot_conf
docker run --rm \
  -v shaheen-edu-test_certbot_conf:/etc/letsencrypt \
  alpine:3.20 sh -c 'apk add --no-cache openssl && mkdir -p /etc/letsencrypt/live/'"$API_DOMAIN"' && openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj /CN='"$API_DOMAIN"' -keyout /etc/letsencrypt/live/'"$API_DOMAIN"'/privkey.pem -out /etc/letsencrypt/live/'"$API_DOMAIN"'/fullchain.pem'
docker compose up -d --build --wait
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d "$API_DOMAIN" --email <ops-email> --agree-tos --no-eff-email
docker compose exec nginx nginx -s reload
```

The first command is safe if the volume already exists. The temporary
certificate is only a bootstrap step; keep the real certificate volume when
resetting application data. If certificate issuance fails, verify DNS and
that port 80 reaches this host before retrying.

Validate the deployment:

```sh
curl --fail --show-error https://"$API_DOMAIN"/health
curl --fail --show-error https://"$API_DOMAIN"/api/docs >/dev/null
docker compose ps
```

Swagger is intentionally public on this test server at `/api/docs`. Do not
enter real learner data into the shared environment.

For an end-to-end browser check, log in through the intended frontend and
confirm the response sets a `refresh_token` cookie with `Secure`, `HttpOnly`,
and `SameSite=None`. Then refresh the page and verify the frontend can call
`POST /api/v1/auth/refresh` with credentials.

## Releases and rollback

Always record the currently running revision before an update:

```sh
git rev-parse HEAD
git fetch --tags origin
git checkout <reviewed-tag-or-commit>
cd deploy/test-server
docker compose up -d --build --force-recreate --wait
curl --fail --show-error https://"$API_DOMAIN"/health
```

Watch the migration and API during a release:

```sh
docker compose logs --follow migrate api
```

If a release fails after a schema migration, **do not automatically roll back
the application image**: the old revision may not understand the new schema.
First inspect the migration and logs, then either deploy a compatible fix or
restore the database backup taken before the release. If no migration ran and
the previous revision is schema-compatible, roll back by checking out the
last known-good tag/commit and rerunning the release command above.

## Routine operations

### Health and logs

```sh
docker compose ps
docker compose logs --tail=200 api nginx migrate
curl --fail --show-error https://"$API_DOMAIN"/health
```

Nginx proxies Bunny webhooks without changing their request body or headers.
For webhook failures, inspect the API logs first, then verify the configured
public callback URL and the Bunny read-only key.

### TLS renewal

Run this monthly using the deploy account (a root or deploy-user cron/systemd
timer is appropriate), and alert on failure:

```sh
docker compose run --rm certbot renew --webroot -w /var/www/certbot
docker compose exec nginx nginx -s reload
```

Test renewal configuration once with `certbot renew --dry-run` using the same
Compose command. Renewals need inbound port 80 to remain available.

### Database backups and restore

Create a backup before every release and at least daily. Store backups off the
server and encrypt them according to the team's policy.

```sh
mkdir -p backups
docker compose exec -T postgres pg_dump --clean --if-exists --no-owner \
  -U "$POSTGRES_USER" "$POSTGRES_DB" > "backups/edu-test-$(date +%F-%H%M).sql"
```

To restore, first stop the API and take a safety backup. This overwrites the
current test database, so confirm the exact backup file with the team:

```sh
docker compose stop api
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" < backups/<approved-backup>.sql
docker compose up -d --wait api nginx
```

### Controlled test-data reset

This destroys only Postgres and Redis test data. It preserves TLS
certificates, source code, and the server `.env` file. Obtain team approval
and take a backup first.

```sh
docker compose down
docker volume rm shaheen-edu-test_postgres_data shaheen-edu-test_redis_data
docker compose up -d --build --wait
```

The next startup applies every migration and creates the configured seeded
super-admin account. It does not recreate remote Bunny assets; clean those up
separately if needed.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Certificate issuance fails | Confirm DNS, port 80 reachability, the Nginx ACME path, and `docker compose logs nginx`. |
| API never starts | Inspect `docker compose logs migrate api`; fix migration or required environment-variable errors before retrying. |
| Browser request is blocked by CORS | Match the full frontend origin exactly in `CORS_ORIGINS`; include scheme and development port. |
| Login succeeds but refresh fails | Confirm `credentials: 'include'`, HTTPS, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none`, and that the browser permits third-party cookies for the test site. |
| Upload returns 413 | Check the Nginx `client_max_body_size` setting and the API's asset-size environment limits. |
| Health endpoint fails externally | Verify Nginx is healthy, the API container is healthy, and firewall rules allow 443. |

The health endpoint is unversioned: `GET /health`. All other API routes are
under `/api/v1`, and the OpenAPI UI is at `/api/docs`.

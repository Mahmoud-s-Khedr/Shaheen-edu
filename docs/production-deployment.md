# Production deployment

This is the supported single-host production baseline. It is separate from
`deploy/test-server`; do not promote the test stack or its credentials.

## Before first launch

1. Store a completed `deploy/production/.env` in the production secret manager,
   set its filesystem mode to `0600`, and never commit it.
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
   docker compose up -d --build --wait
   docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
     -d "$API_DOMAIN" --email <operations-email> --agree-tos --no-eff-email
   docker compose exec nginx nginx -s reload
   ```

   Confirm that DNS and port 80 are reachable before requesting the real
   certificate. The temporary certificate is only a bootstrap step.

4. Run the bootstrap profile exactly once for a new database. Before doing so,
   set `ALLOW_PRODUCTION_BOOTSTRAP=true` and the two approved
   `INITIAL_REFUND_*` values. Reset the acknowledgement to `false` immediately
   afterwards. Normal releases run migrations only and never seed financial data.
5. Verify `https://<API_DOMAIN>/health/ready`, the worker health status, signed
   Bunny upload/playback webhook flow, Paymob callback HMAC flow, and the full
   staging acceptance suite before enabling any feature flag.

## Release and recovery controls

- Deploy only an immutable reviewed commit or image digest. Take and verify an
  encrypted, off-host PostgreSQL backup before every migration and daily.
- Do not roll back application code across a completed schema migration unless
  compatibility has been reviewed. Prefer a forward fix or a tested restore.
- Keep finance/referral/export feature flags disabled until their explicit
  rollout approvals, allow-lists, reconciliation, and rollback owners exist.
- The API and worker both expose container-local readiness endpoints. A worker
  that loses BullMQ readiness becomes unhealthy instead of silently consuming
  no jobs.

This guide intentionally does not define dashboards or alert routing; those
observability controls are tracked separately.

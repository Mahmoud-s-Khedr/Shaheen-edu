# Production Deployment Report — 4 Sep 2026

> Domain-cutover update: 7 Sep 2026. The deployed Docker stack remains
> healthy, but the public hostname is still `api-edu.mydevtest.website`.
> The Jibal hostname cutover below is pending; do not remove the old API
> virtual host or DNS record until the new API endpoint passes its checks.

## Completed

- Production backend deployed successfully.
- Public API is live with HTTPS at `https://api-edu.mydevtest.website`.
- A Let's Encrypt TLS certificate was issued and automatic renewal is configured.
- The public API readiness endpoint passes.
- API, worker, Redis, and the internal API gateway are healthy.
- PostgreSQL is reachable from Docker through `host.docker.internal`.
- Prisma baseline migration `20260830000000_baseline` was applied successfully.
- Initial bootstrap completed:
  - Super-admin created.
  - Initial refund policy created.
  - Egyptian governorates and centers seeded.
- Bunny Storage is configured for application assets and encrypted database backups.
- An encrypted Restic backup repository was initialized in Bunny Storage.
- The Restic encryption password is stored root-only at
  `/etc/shaheen-edu/restic-password`.
- Dedicated PostgreSQL backup role `edu_backup` was created with backup access.
- A manual backup completed successfully.
- A restore drill to the disposable `edu_restore` database completed successfully.
- Backup retention is configured for 14 days. At a four-hour schedule, this is
  approximately 84 recovery points.
- Paymob remains intentionally unconfigured; manual orders remain available.

## Remaining work

### Jibal hostname cutover (current priority)

| Hostname | Destination |
| --- | --- |
| `jibal-platform.com` | public-site frontend host |
| `app.jibal-platform.com` | learner/parent frontend host |
| `admin.jibal-platform.com` | administrator frontend host |
| `api.jibal-platform.com` | this VPS's host Nginx, proxying to `127.0.0.1:13000` |

The frontend repositories, Nginx configuration, TLS issuance, routine update,
verification, and rollback process are documented in the
[frontend production deployment runbook](frontend-production-deployment.md).

1. Create the DNS records. Only `api.jibal-platform.com` should point to this
   VPS. The other three names must point to their frontend host/provider. Wait
   until `dig +short api.jibal-platform.com` returns this VPS's public IP.

2. On the VPS, capture the active Nginx and certificate configuration before
   changing it. This preserves the currently working API path:

   ```sh
   sudo nginx -T
   sudo certbot certificates
   curl --fail-with-body http://127.0.0.1:13000/health/ready
   sudo ss -ltnp '( sport = :80 or sport = :443 or sport = :13000 )'
   ```

3. Update `/home/ubuntu/Shaheen-edu/deploy/production/.env` with the exact
   production browser origins, then recreate only API and worker services.

   ```dotenv
   CORS_ORIGINS=https://jibal-platform.com,https://app.jibal-platform.com,https://admin.jibal-platform.com
   COOKIE_SECURE=true
   COOKIE_SAME_SITE=lax
   PAYMOB_NOTIFICATION_URL=https://api.jibal-platform.com/api/v1/payments/paymob/webhook
   PAYMOB_REDIRECT_URL=https://app.jibal-platform.com/payment-result
   ```

   ```sh
   cd /home/ubuntu/Shaheen-edu/deploy/production
   docker compose --env-file .env config --quiet
   docker compose up -d --no-deps --force-recreate api worker
   docker compose ps
   ```

4. Add a host-Nginx virtual host for `api.jibal-platform.com`. It must listen
   on `443`, terminate a certificate for that exact name, and proxy only to
   `http://127.0.0.1:13000` with `Host`, `X-Real-IP`,
   `X-Forwarded-For`, `X-Forwarded-Proto https`, and `X-Forwarded-Port`.
   Obtain a separate Let's Encrypt certificate after DNS propagation. Test
   `sudo nginx -t` before reload.

5. Validate the new public API before removing the old virtual host:

   ```sh
   curl --fail-with-body https://api.jibal-platform.com/health/ready
   curl --fail-with-body https://api.jibal-platform.com/api/docs >/dev/null
   ```

   Then test login and refresh from each frontend. Browser calls must use
   `credentials: 'include'` (or equivalent), and the refresh cookie must be
   `Secure`, `HttpOnly`, and `SameSite=Lax`.

6. Set Bunny Stream's webhook URL to
   `https://api.jibal-platform.com/api/v1/integrations/bunny-stream/webhook`.
   When Paymob production access is available, register the notification and
   redirect URLs above before enabling online payments. Retire the old API
   virtual host only after monitoring the new endpoint and callbacks.

1. Enable scheduled backups.

   The supplied systemd units expect the repository at `/opt/shaheen-edu`, but
   this VPS checkout is at `/home/ubuntu/Shaheen-edu`. Create persistent
   systemd overrides, test one scheduled backup, then enable the four-hour
   backup timer and weekly repository verification timer.

2. Confirm backup monitoring.

   After enabling the units, verify upcoming runs with:

   ```sh
   systemctl list-timers 'shaheen-edu-*'
   ```

   Review the first scheduled backup result and perform periodic restore drills.

3. Configure Paymob production access.

   When access is received, add the production credentials, integration IDs,
   webhook URL, and redirect URL. Test the complete payment, webhook, and
   refund flow before enabling online payments for users.

4. Perform production smoke tests through the public API.

   - Super-admin login.
   - Student and parent registration/login.
   - Manual order creation and approval.
   - Bunny asset upload and download.
   - Bunny Stream playback.
   - AI question import, PDF processing, and worker jobs.

5. Complete operational hardening.

   - Confirm Docker starts automatically after a VPS reboot.
   - Confirm the firewall exposes only required public services (SSH, HTTP, and
     HTTPS).
   - Keep `.env`, PostgreSQL password files, backup configuration, and the
     Restic password readable only by root or their intended service account.
   - Revoke and replace any credential that was committed, pasted publicly, or
     used outside its intended production environment.
   - Monitor VPS memory, disk space, Docker logs, and Bunny Storage usage under
     real traffic.

## Current status

The backend is publicly available and operational. The main remaining
production-critical task is enabling and validating the automated encrypted
backup schedule.

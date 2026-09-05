# Production Deployment Report — 4 Sep 2026

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

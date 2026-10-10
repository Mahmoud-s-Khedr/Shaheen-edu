# Partner login email update

Admins and super admins can change an existing partner's login email using
`PATCH /api/v1/admin/partners/{id}/email` with an admin bearer token and:

```json
{ "email": "almarji@jibal-platform.com" }
```

The endpoint returns HTTP 200 with the updated partner summary. It updates only
`User.loginIdentifier`, retaining the same user ID, password, profile, partner
type, account status, content ownership, agreements, referrals, and financial
records. Existing sessions are revoked, so the partner must log in again using
the new email and their existing password. An unchanged email is a no-op.

Emails are trimmed and lowercased. An email used by another user returns 409.
The email change, session revocation, and `PARTNER_EMAIL_UPDATED` audit event
(including the old and new email) are committed in one transaction. The endpoint
is admin-only; `PATCH /partners/me` continues to accept profile fields only.

## Proposed replacements

Confirm spelling and the target environment before applying these replacements.

| Partner | Current login | Proposed login |
| --- | --- | --- |
| كتاب المرجع | almarji.bio@jibal.com | almarji@jibal-platform.com |
| Ibraheim Tarek | referral@example.com | ibraheim.tarek@jibal-platform.com |
| Omnia Awad | test2@test2.com | omnia.awad@jibal-platform.com |
| كتاب المرجع سابقا | test@test.test | almarji.previous@jibal-platform.com |
| كتاب بيان | codex.e2e.partner.4852475@example.com | bayan@jibal-platform.com |
| Shams Elsayed | qa.e2e.20260909@example.com | shams.elsayed@jibal-platform.com |
| كتاب الخبير | mahmoud.s.khedr.2@gmail.com | alkhabir@jibal-platform.com |
| كتاب سنيور | partner@example.com | senior@jibal-platform.com |

Take a database backup, resolve each current email to its existing partner ID,
and verify its display name and partner type. Check all destination emails for
collisions before starting. Update each existing ID through the endpoint and
verify the response keeps that ID. Record progress so a partial run can resume.
Do not delete or recreate accounts. If an email was entered incorrectly, use the
same endpoint to restore its previous login.

Passwords do not need to change for this operation. If a partner does not know
their password, use the separate partner password reset endpoint with an admin-chosen password,
then give them the new login and password through your established channel.
They can change that password after login if they choose.

These addresses work as login identifiers; this operation does not provision
mailboxes or aliases at `jibal-platform.com`.

# Partner password reset

Admins and super admins can set an active partner's password with:

`POST /api/v1/admin/partners/{id}/reset-password`

Send an admin bearer token and a required JSON body:

```json
{ "password": "<admin-chosen password>" }
```

The password must contain 8–128 characters and is stored exactly as supplied,
without trimming. Both referral partners and content publishers are supported.

The endpoint returns HTTP 200 with only:

```json
{ "success": true }
```

The reset revokes existing sessions and clears any mandatory password-change
requirement. The partner can log in with the new password and access partner
features immediately. They can optionally change it using
`POST /api/v1/auth/change-password`, supplying the admin-chosen password as
`oldPassword` and their chosen password as `newPassword`.

The password hash update, internal reset timestamp, session revocation, and
`PARTNER_PASSWORD_RESET` audit event are committed together. The password is
never returned or included in the audit event. Existing account IDs, profiles,
and linked records are preserved.

Clients must now send `password`; requests without it return HTTP 400. The
response no longer includes `temporaryPassword` or `passwordResetAt`. Student
and administrator password-reset endpoints retain their existing contracts.

Errors: 400 for an invalid or missing password, 401 for unauthenticated requests,
403 for unauthorized roles, 404 for a missing or non-partner account, and 409 for
an inactive partner or a concurrent account state change.

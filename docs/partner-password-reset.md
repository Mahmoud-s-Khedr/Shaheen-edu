# Partner password reset

Admins and super admins can reset an active partner's password with:

`POST /api/v1/admin/partners/{id}/reset-password`

Send the admin's bearer token. No request body is required. Both referral partners
and content publishers are supported.

The endpoint returns HTTP 200 with:

```json
{
  "temporaryPassword": "<generated temporary password>",
  "passwordResetAt": "2026-10-10T12:00:00.000Z"
}
```

The admin should give the temporary password to the partner. The reset revokes
existing sessions and requires the partner to change their password after logging
in. Use `POST /api/v1/auth/change-password` with the temporary password as
`oldPassword` and the chosen password as `newPassword`.

The password update, session revocation, and `PARTNER_PASSWORD_RESET` audit event
are committed together. The audit event does not include the temporary password.

Errors: 401 for unauthenticated requests, 403 for unauthorized roles, 404 for a
missing or non-partner account, and 409 for an inactive partner or a concurrent
account state change.

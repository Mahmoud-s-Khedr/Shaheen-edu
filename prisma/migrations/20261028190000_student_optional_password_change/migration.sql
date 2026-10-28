-- An admin password reset no longer forces students to change the issued
-- password. Release students who were reset under the old forced-change rule.
UPDATE "User"
SET "mustChangePassword" = false
WHERE "role" = 'STUDENT' AND "mustChangePassword" = true;

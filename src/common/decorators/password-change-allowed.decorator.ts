import { SetMetadata } from '@nestjs/common';

export const PASSWORD_CHANGE_ALLOWED_KEY = 'passwordChangeAllowed';
export const PasswordChangeAllowed = () =>
  SetMetadata(PASSWORD_CHANGE_ALLOWED_KEY, true);

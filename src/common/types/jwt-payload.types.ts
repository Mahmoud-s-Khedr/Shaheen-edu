import type { Role } from './roles.enum';

export interface UserAccessTokenPayload {
  sub: string;
  role: Role;
  sid: string;
  typ: 'user_access';
  iat: number;
  exp: number;
}

export interface ParentAccessTokenPayload {
  pid: string;
  active: string | null;
  typ: 'parent_access';
  iat: number;
  exp: number;
}

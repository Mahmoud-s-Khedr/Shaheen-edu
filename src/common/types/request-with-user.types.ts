import type { FastifyRequest } from 'fastify';
import type { Role } from './roles.enum';

export interface RequestUser {
  id: string;
  role: Role;
  sessionId: string;
}

export interface RequestParentSession {
  id: string;
  activeStudentId: string | null;
  parentPhoneNormalized: string;
}

export type RequestWithUser = FastifyRequest & {
  user?: RequestUser;
  parentSession?: RequestParentSession;
};

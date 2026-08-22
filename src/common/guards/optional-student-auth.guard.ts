import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../../database/prisma.service';
import { AccountStatus, Role } from '../types/roles.enum';
import type { AppConfig } from '../../config/configuration';
import type { RequestWithUser } from '../types/request-with-user.types';

/** Hydrates a catalog caller when a bearer token is supplied, without requiring one. */
@Injectable()
export class OptionalStudentAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    if (!header) return true;
    if (!header.startsWith('Bearer '))
      throw new UnauthorizedException('Unauthorized');
    try {
      const payload = jwt.verify(
        header.slice(7),
        this.config.get('jwt', { infer: true }).accessSecret,
      ) as { typ: string; sub: string; sid: string };
      if (payload.typ !== 'user_access') throw new Error();
      const [session, user] = await Promise.all([
        this.prisma.authSession.findUnique({ where: { id: payload.sid } }),
        this.prisma.user.findUnique({ where: { id: payload.sub } }),
      ]);
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revoked ||
        session.expiresAt < new Date() ||
        !user ||
        user.role !== Role.STUDENT ||
        user.status !== AccountStatus.ACTIVE
      )
        throw new Error();
      request.user = { id: user.id, role: user.role, sessionId: session.id };
      return true;
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
  }
}

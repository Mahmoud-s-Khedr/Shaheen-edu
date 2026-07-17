import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../../database/prisma.service';
import type { ParentAccessTokenPayload } from '../types/jwt-payload.types';
import type { RequestWithUser } from '../types/request-with-user.types';
import type { AppConfig } from '../../config/configuration';

/**
 * Applied locally (via @UseGuards) on parent-scoped routes. Those routes
 * must ALSO carry @Public() to skip the global UserAuthGuard, since a
 * parent access token is a different token type entirely (typ=parent_access,
 * separate secret, no `sub`/`role`).
 */
@Injectable()
export class ParentAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Unauthorized');
    }
    const token = authHeader.slice('Bearer '.length);

    let payload: ParentAccessTokenPayload;
    try {
      payload = jwt.verify(
        token,
        this.configService.get('jwt', { infer: true }).parentAccessSecret,
      ) as ParentAccessTokenPayload;
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }

    if (payload.typ !== 'parent_access') {
      throw new UnauthorizedException('Unauthorized');
    }

    const session = await this.prisma.parentAccessSession.findUnique({
      where: { id: payload.pid },
    });
    if (!session || session.revoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Unauthorized');
    }

    request.parentSession = {
      id: session.id,
      activeStudentId: session.activeStudentId,
      parentPhoneNormalized: session.parentPhoneNormalized,
    };
    return true;
  }
}

import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthService } from '../services/auth.service';
import { PartnerLoginDto } from '../dto/login.dto';
import { Role } from '../../../common/types/roles.enum';
import { setRefreshCookie } from '../utils/refresh-cookie.util';
import type { AppConfig } from '../../../config/configuration';

@ApiTags('auth/partners')
@Controller({ path: 'auth/partners', version: '1' })
export class PartnerAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: PartnerLoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const result = await this.authService.loginWithPassword({
      loginIdentifier: normalizedEmail,
      password: dto.password,
      allowedRoles: [Role.PARTNER],
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      purpose: 'partner-login',
    });
    setRefreshCookie(reply, result.refreshToken, this.configService);
    return { accessToken: result.accessToken, user: result.user };
  }
}

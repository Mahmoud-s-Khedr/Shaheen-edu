import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthService } from '../services/auth.service';
import { PartnerLoginDto } from '../dto/login.dto';
import { Role } from '../../../common/types/roles.enum';
import { setRefreshCookie } from '../utils/refresh-cookie.util';
import type { AppConfig } from '../../../config/configuration';
import { ApiStandardErrors } from '../../../common/decorators/api-standard-errors.decorator';
import { AuthTokenResponseDto } from '../../../common/dto/api-response.dto';
import { AuthRouteThrottle } from '../../../common/decorators/auth-route-throttle.decorator';

@ApiTags('auth/partners')
@Controller({ path: 'auth/partners', version: '1' })
export class PartnerAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @AuthRouteThrottle()
  @Post('login')
  @ApiOperation({
    summary: 'Log in as a partner',
    description: 'Sets an HttpOnly refresh_token cookie on success.',
  })
  @ApiCreatedResponse({
    type: AuthTokenResponseDto,
    headers: { 'Set-Cookie': { schema: { type: 'string' } } },
  })
  @ApiStandardErrors(401, 429)
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

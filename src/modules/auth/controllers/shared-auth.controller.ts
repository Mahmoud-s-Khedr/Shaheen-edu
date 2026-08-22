import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../../../common/decorators/public.decorator';
import { PasswordChangeAllowed } from '../../../common/decorators/password-change-allowed.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { SessionService } from '../services/session.service';
import { PasswordService } from '../services/password.service';
import { AuthRateLimitService } from '../services/auth-rate-limit.service';
import { ChangePasswordDto } from '../dto/change-password.dto';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  setRefreshCookie,
} from '../utils/refresh-cookie.util';
import type { RequestUser } from '../../../common/types/request-with-user.types';
import type { AppConfig } from '../../../config/configuration';
import { ApiStandardErrors } from '../../../common/decorators/api-standard-errors.decorator';
import {
  AuthTokenResponseDto,
  CurrentUserDto,
  SuccessResponseDto,
} from '../../../common/dto/api-response.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class SharedAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly passwordService: PasswordService,
    private readonly rateLimitService: AuthRateLimitService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh user access token',
    description:
      'Rotates the HttpOnly refresh_token cookie and returns a new bearer access token.',
  })
  @ApiCookieAuth('refresh_token')
  @ApiCreatedResponse({
    type: AuthTokenResponseDto,
    description: 'Access token issued and refresh_token cookie rotated.',
    headers: {
      'Set-Cookie': {
        description: 'Rotated HttpOnly refresh_token cookie.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiStandardErrors(401, 429)
  async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawToken) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.rateLimitService.assertNotLimited(
      'refresh',
      AuthRateLimitService.hashIdentifier(rawToken.slice(0, 16)),
      req.ip,
    );

    const result = await this.sessionService.rotate({
      rawToken,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setRefreshCookie(reply, result.refreshToken, this.configService);
    return {
      accessToken: result.accessToken,
      user: {
        id: result.user.id,
        role: result.user.role,
        loginIdentifier: result.user.loginIdentifier,
        mustChangePassword: result.user.mustChangePassword,
      },
    };
  }

  @Post('logout')
  @PasswordChangeAllowed()
  @ApiOperation({
    summary: 'Log out of the current browser session',
    description:
      'Requires a bearer access token. When a refresh_token cookie is present, its session is revoked; the cookie is always cleared.',
  })
  @ApiBearerAuth()
  @ApiCreatedResponse({
    type: SuccessResponseDto,
    headers: {
      'Set-Cookie': {
        description: 'Clears the refresh_token cookie.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiStandardErrors(401)
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    // The bearer token identifies the browser session being logged out. The
    // cookie can be absent, stale, or belong to another rotation generation,
    // so it must not be the only revocation mechanism.
    await this.sessionService.revokeById(user.sessionId, user.id);
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawToken) {
      await this.sessionService.revokeByRawToken(rawToken);
    }
    clearRefreshCookie(reply, this.configService);
    return { success: true };
  }

  @Post('logout-all')
  @PasswordChangeAllowed()
  @ApiOperation({
    summary: 'Log out of all user sessions',
    description:
      'Revokes every refresh session for the authenticated user and clears the browser refresh_token cookie.',
  })
  @ApiBearerAuth()
  @ApiCreatedResponse({
    type: SuccessResponseDto,
    headers: {
      'Set-Cookie': {
        description: 'Clears the refresh_token cookie.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiStandardErrors(401)
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.sessionService.revokeAllForUser(user.id);
    clearRefreshCookie(reply, this.configService);
    return { success: true };
  }

  @ApiBearerAuth()
  @Get('me')
  @PasswordChangeAllowed()
  @ApiOperation({ summary: 'Get the authenticated user' })
  @ApiOkResponse({ type: CurrentUserDto })
  @ApiStandardErrors(401)
  async me(@CurrentUser() user: RequestUser) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        role: true,
        status: true,
        loginIdentifier: true,
        lastLoginAt: true,
        createdAt: true,
        mustChangePassword: true,
      },
    });
    return dbUser;
  }

  @ApiBearerAuth()
  @Post('change-password')
  @PasswordChangeAllowed()
  @ApiOperation({
    summary: 'Change the authenticated user password',
    description: 'Revokes all active sessions and clears the refresh cookie.',
  })
  @ApiCreatedResponse({ type: SuccessResponseDto })
  @ApiStandardErrors(400, 401, 429)
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.rateLimitService.assertNotLimited(
      'password-change',
      AuthRateLimitService.hashIdentifier(user.id),
      undefined,
    );

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!dbUser) {
      throw new UnauthorizedException('Unauthorized');
    }

    const oldPasswordOk = await this.passwordService.verify(
      dbUser.passwordHash,
      dto.oldPassword,
    );
    if (!oldPasswordOk) {
      throw new BadRequestException('Old password is incorrect');
    }

    const newPasswordHash = await this.passwordService.hash(dto.newPassword);
    // Password replacement and session invalidation are one security
    // boundary: neither state should commit without the other.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash, mustChangePassword: false },
      }),
      this.prisma.authSession.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);
    clearRefreshCookie(reply, this.configService);

    return { success: true };
  }
}

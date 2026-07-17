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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../../../common/decorators/public.decorator';
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
      },
    };
  }

  @Post('logout')
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawToken) {
      await this.sessionService.revokeByRawToken(rawToken);
    }
    clearRefreshCookie(reply, this.configService);
    return { success: true };
  }

  @Post('logout-all')
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
      },
    });
    return dbUser;
  }

  @ApiBearerAuth()
  @Post('change-password')
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
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    // Force re-login everywhere, same as logout-all.
    await this.sessionService.revokeAllForUser(user.id);
    clearRefreshCookie(reply, this.configService);

    return { success: true };
  }
}

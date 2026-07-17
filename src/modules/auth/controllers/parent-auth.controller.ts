import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Public } from '../../../common/decorators/public.decorator';
import { ParentAuthGuard } from '../../../common/guards/parent-auth.guard';
import { ParentSelectedChildGuard } from '../../../common/guards/parent-selected-child.guard';
import { CurrentParentSession } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { NationalIdService } from '../services/national-id.service';
import { ParentSessionService } from '../services/parent-session.service';
import { AuthRateLimitService } from '../services/auth-rate-limit.service';
import { ParentLoginDto } from '../dto/login.dto';
import { SelectChildDto } from '../dto/select-child.dto';
import {
  isValidEgyptianPhone,
  normalizeEgyptianPhone,
} from '../../../common/utils/phone.util';
import type { RequestParentSession } from '../../../common/types/request-with-user.types';

/**
 * All routes on this controller are @Public() to skip the global
 * UserAuthGuard (parent access tokens are a different token type entirely),
 * and separately apply ParentAuthGuard where a session is required.
 */
@ApiTags('auth/parents')
@Controller({ path: 'auth/parents', version: '1' })
export class ParentAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nationalIdService: NationalIdService,
    private readonly parentSessionService: ParentSessionService,
    private readonly rateLimitService: AuthRateLimitService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: ParentLoginDto, @Req() req: FastifyRequest) {
    const normalizedNationalId = this.nationalIdService.normalize(
      dto.nationalId,
    );
    const normalizedParentPhone = normalizeEgyptianPhone(dto.parentPhone);
    if (!isValidEgyptianPhone(normalizedParentPhone)) {
      throw new BadRequestException('Invalid phone number format');
    }

    const hashedIdentifier = AuthRateLimitService.hashParentIdentifier(
      normalizedNationalId,
      normalizedParentPhone,
    );
    await this.rateLimitService.assertLoginAllowed(
      'parent-login',
      hashedIdentifier,
      req.ip,
    );

    if (!this.nationalIdService.validateFormat(normalizedNationalId)) {
      await this.rateLimitService.recordLoginFailure(
        'parent-login',
        hashedIdentifier,
      );
      throw new UnauthorizedException('Invalid credentials');
    }
    const nationalIdHash = this.nationalIdService.hash(normalizedNationalId);

    const student = await this.prisma.studentProfile.findUnique({
      where: { nationalIdHash },
    });

    if (!student || student.parentPhoneNormalized !== normalizedParentPhone) {
      await this.rateLimitService.recordLoginFailure(
        'parent-login',
        hashedIdentifier,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.rateLimitService.clearLoginFailures(
      'parent-login',
      hashedIdentifier,
    );

    const { accessToken } = await this.parentSessionService.createSession({
      parentPhoneNormalized: normalizedParentPhone,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return { accessToken };
  }

  @Public()
  @UseGuards(ParentAuthGuard)
  @ApiBearerAuth()
  @Get('children')
  async children(@CurrentParentSession() parentSession: RequestParentSession) {
    return this.parentSessionService.listChildren(
      parentSession.parentPhoneNormalized,
    );
  }

  @Public()
  @UseGuards(ParentAuthGuard)
  @ApiBearerAuth()
  @Post('select-child')
  async selectChild(
    @CurrentParentSession() parentSession: RequestParentSession,
    @Body() dto: SelectChildDto,
  ) {
    return this.parentSessionService.selectChild({
      parentSessionId: parentSession.id,
      parentPhoneNormalized: parentSession.parentPhoneNormalized,
      studentUserId: dto.studentUserId,
    });
  }

  @Public()
  @UseGuards(ParentAuthGuard, ParentSelectedChildGuard)
  @ApiBearerAuth()
  @Get('selected-child')
  async selectedChild(
    @CurrentParentSession() parentSession: RequestParentSession,
  ) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: parentSession.activeStudentId! },
      select: {
        userId: true,
        fullName: true,
        governorate: true,
        center: true,
      },
    });
    return student;
  }
}

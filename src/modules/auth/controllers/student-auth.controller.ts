import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthService } from '../services/auth.service';
import { RegisterStudentDto } from '../dto/register-student.dto';
import { StudentLoginDto } from '../dto/login.dto';
import { Role } from '../../../common/types/roles.enum';
import {
  isValidEgyptianPhone,
  normalizeEgyptianPhone,
} from '../../../common/utils/phone.util';
import { setRefreshCookie } from '../utils/refresh-cookie.util';
import type { AppConfig } from '../../../config/configuration';
import { ApiStandardErrors } from '../../../common/decorators/api-standard-errors.decorator';
import { AuthTokenResponseDto } from '../../../common/dto/api-response.dto';

@ApiTags('auth/students')
@Controller({ path: 'auth/students', version: '1' })
export class StudentAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register a student',
    description:
      'Creates a student account and sets an HttpOnly refresh_token cookie.',
  })
  @ApiCreatedResponse({
    type: AuthTokenResponseDto,
    headers: { 'Set-Cookie': { schema: { type: 'string' } } },
  })
  @ApiStandardErrors(400, 404, 409)
  async register(
    @Body() dto: RegisterStudentDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authService.registerStudent(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
    setRefreshCookie(reply, result.refreshToken, this.configService);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({
    summary: 'Log in as a student',
    description: 'Sets an HttpOnly refresh_token cookie on success.',
  })
  @ApiCreatedResponse({
    type: AuthTokenResponseDto,
    headers: { 'Set-Cookie': { schema: { type: 'string' } } },
  })
  @ApiStandardErrors(400, 401, 429)
  async login(
    @Body() dto: StudentLoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const normalizedPhone = normalizeEgyptianPhone(dto.phone);
    if (!isValidEgyptianPhone(normalizedPhone)) {
      throw new BadRequestException('Invalid phone number format');
    }
    const result = await this.authService.loginWithPassword({
      loginIdentifier: normalizedPhone,
      password: dto.password,
      allowedRoles: [Role.STUDENT],
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      purpose: 'student-login',
    });
    setRefreshCookie(reply, result.refreshToken, this.configService);
    return { accessToken: result.accessToken, user: result.user };
  }
}

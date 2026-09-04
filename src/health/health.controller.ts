import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { AppConfig } from '../config/configuration';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.version = configService.get('version', { infer: true });
  }

  private readonly version: string;

  @Public()
  @Get()
  @ApiOperation({ summary: 'Check service health' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['status', 'version', 'timestamp'],
      properties: {
        status: { type: 'string', example: 'ok' },
        version: { type: 'string', example: '2026.09.04' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  check(): { status: 'ok'; version: string; timestamp: string } {
    return {
      status: 'ok',
      version: this.version,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Check database and Redis readiness' })
  async ready() {
    const checks = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
    ]);
    const database = checks[0].status === 'fulfilled' ? 'up' : 'down';
    const redis = checks[1].status === 'fulfilled' ? 'up' : 'down';
    if (database === 'down' || redis === 'down') {
      throw new ServiceUnavailableException({
        message: 'Service dependencies are unavailable',
        meta: { database, redis },
      });
    }
    return {
      status: 'ready' as const,
      version: this.version,
      dependencies: { database, redis },
      timestamp: new Date().toISOString(),
    };
  }
}

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../config/configuration';
import { ObservabilityService } from '../common/logging/observability.service';
import { safeErrorRecord } from '../common/logging/error-record';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly diagnostics: ObservabilityService,
  ) {
    this.client = new Redis(
      this.configService.get('redisUrl', { infer: true }),
      {
        lazyConnect: true,
      },
    );
    this.client.on('error', (error) =>
      this.diagnostics.emit({
        event: 'redis_persistence_warning',
        operation: 'redis_client_connection',
        outcome: 'failure',
        reasonCode: 'REDIS_CLIENT_ERROR',
        ...safeErrorRecord(error),
      }),
    );
    this.client.on('end', () =>
      this.diagnostics.emit({
        event: 'redis_persistence_warning',
        operation: 'redis_client_connection',
        outcome: 'failure',
        reasonCode: 'REDIS_CONNECTION_ENDED',
      }),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis disconnected');
  }
}

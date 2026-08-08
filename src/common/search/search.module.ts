import { Global, Module } from '@nestjs/common';
import { ArabicSearchHealthIndicator } from './arabic-search.health';

/**
 * Holds cross-cutting search infrastructure. Kept separate from DatabaseModule
 * so PrismaService stays connection-only.
 */
@Global()
@Module({
  providers: [ArabicSearchHealthIndicator],
  exports: [ArabicSearchHealthIndicator],
})
export class SearchModule {}

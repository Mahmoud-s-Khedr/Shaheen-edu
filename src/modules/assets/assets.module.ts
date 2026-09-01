import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AssetsController } from './assets.controller';
import { CoverAccessController } from './cover-access.controller';
import { AssetsService } from './assets.service';
import { BunnyStorageProvider } from './bunny-storage.provider';
@Module({
  imports: [AuditModule],
  controllers: [AssetsController, CoverAccessController],
  providers: [AssetsService, BunnyStorageProvider],
  exports: [AssetsService, BunnyStorageProvider],
})
export class AssetsModule {}

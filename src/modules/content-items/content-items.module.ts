import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContentItemsController } from './content-items.controller';
import { ContentItemsService } from './content-items.service';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [AuditModule, AssetsModule],
  controllers: [ContentItemsController],
  providers: [ContentItemsService],
})
export class ContentItemsModule {}

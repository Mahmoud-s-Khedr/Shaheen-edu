import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContentItemsController } from './content-items.controller';
import { ContentItemsService } from './content-items.service';

@Module({
  imports: [AuditModule],
  controllers: [ContentItemsController],
  providers: [ContentItemsService],
})
export class ContentItemsModule {}

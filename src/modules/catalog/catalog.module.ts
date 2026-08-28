import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { StudentCatalogController } from './student-catalog.controller';
import { StudentCatalogService } from './student-catalog.service';
import { CompletionModule } from '../completion/completion.module';

@Module({
  imports: [CompletionModule],
  controllers: [CatalogController, StudentCatalogController],
  providers: [CatalogService, StudentCatalogService],
})
export class CatalogModule {}

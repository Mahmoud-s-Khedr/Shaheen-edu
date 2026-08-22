import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { ParentAuthGuard } from '../../common/guards/parent-auth.guard';
import { ParentSelectedChildGuard } from '../../common/guards/parent-selected-child.guard';
import { PerformanceController } from './performance.controller';
import { ParentPerformanceController } from './parent-performance.controller';
import { PerformanceService } from './performance.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [PerformanceController, ParentPerformanceController],
  providers: [PerformanceService, ParentAuthGuard, ParentSelectedChildGuard],
  exports: [PerformanceService],
})
export class PerformanceModule {}

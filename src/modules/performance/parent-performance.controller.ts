import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentParentSession } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ParentAuthGuard } from '../../common/guards/parent-auth.guard';
import { ParentSelectedChildGuard } from '../../common/guards/parent-selected-child.guard';
import type { RequestParentSession } from '../../common/types/request-with-user.types';
import {
  PerformanceAnalysisQueryDto,
  PerformanceInsightsQueryDto,
  PerformancePeriodQueryDto,
  PerformanceTrendQueryDto,
} from './performance.dto';
import { PerformanceService } from './performance.service';

@ApiTags('parent/performance')
@Public()
@ApiBearerAuth()
@UseGuards(ParentAuthGuard, ParentSelectedChildGuard)
@Controller({ path: 'parent/selected-child/performance', version: '1' })
export class ParentPerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get()
  @ApiOperation({ summary: 'Get selected child unified performance overview' })
  overview(
    @CurrentParentSession() parent: RequestParentSession,
    @Query() query: PerformancePeriodQueryDto,
  ) {
    return this.performance.parentOverview(parent, query);
  }

  @Get('analysis')
  @ApiOperation({
    summary: 'Analyze selected child performance by curriculum scope',
  })
  analysis(
    @CurrentParentSession() parent: RequestParentSession,
    @Query() query: PerformanceAnalysisQueryDto,
  ) {
    return this.performance.parentAnalysis(parent, query);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Get selected child unified performance trends' })
  trends(
    @CurrentParentSession() parent: RequestParentSession,
    @Query() query: PerformanceTrendQueryDto,
  ) {
    return this.performance.parentTrends(parent, query);
  }

  @Get('insights')
  @ApiOperation({ summary: 'Get selected child performance insights' })
  insights(
    @CurrentParentSession() parent: RequestParentSession,
    @Query() query: PerformanceInsightsQueryDto,
  ) {
    return this.performance.parentInsights(parent, query);
  }
}

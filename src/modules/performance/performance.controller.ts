import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PerformanceService } from './performance.service';
import {
  PerformanceAnalysisQueryDto,
  PerformanceAnswerChangesQueryDto,
  PerformancePeersQueryDto,
  PerformancePeriodQueryDto,
  PerformanceTrendQueryDto,
} from './performance.dto';

@ApiTags('student/performance')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/performance', version: '1' })
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}
  @Get('overview') overview(
    @CurrentUser() user: RequestUser,
    @Query() query: PerformancePeriodQueryDto,
  ) {
    return this.performance.overview(user.id, query);
  }
  @Get('analysis') analysis(
    @CurrentUser() user: RequestUser,
    @Query() query: PerformanceAnalysisQueryDto,
  ) {
    return this.performance.analysis(user.id, query);
  }
  @Get('trends') trends(
    @CurrentUser() user: RequestUser,
    @Query() query: PerformanceTrendQueryDto,
  ) {
    return this.performance.trends(user.id, query);
  }
  @Get('peers') peers(
    @CurrentUser() user: RequestUser,
    @Query() query: PerformancePeersQueryDto,
  ) {
    return this.performance.peers(user.id, query);
  }
  @Get('answer-changes') answerChanges(
    @CurrentUser() user: RequestUser,
    @Query() query: PerformanceAnswerChangesQueryDto,
  ) {
    return this.performance.answerChanges(user.id, query);
  }
}

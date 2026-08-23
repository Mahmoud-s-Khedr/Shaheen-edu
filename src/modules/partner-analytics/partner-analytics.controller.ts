import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PartnerAnalyticsService } from './partner-analytics.service';
import {
  PartnerContentQueryDto,
  PartnerAllocationsQueryDto,
  PartnerEarningsQueryDto,
  PartnerPeriodQueryDto,
  PartnerQuestionUsageQueryDto,
} from './dto/partner-analytics.dto';

@ApiTags('partners/analytics')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.PARTNER)
@Controller({ path: 'partners', version: '1' })
export class PartnerAnalyticsController {
  constructor(private readonly analytics: PartnerAnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary:
      'Get content publisher dashboard metrics and compact earnings trend',
  })
  @ApiOkResponse({
    description: 'All money is EGP minor units and is derived solely from immutable allocation ledger rows.',
  })
  @ApiStandardErrors(400, 401, 403)
  dashboard(
    @CurrentUser() user: RequestUser,
    @Query() query: PartnerPeriodQueryDto,
  ) {
    return this.analytics.dashboard(user.id, query);
  }

  @Get('analytics/earnings')
  @ApiOperation({
    summary: 'Get immutable-ledger publisher earnings trends',
  })
  @ApiStandardErrors(400, 401, 403)
  earnings(
    @CurrentUser() user: RequestUser,
    @Query() query: PartnerEarningsQueryDto,
  ) {
    return this.analytics.earnings(user.id, query);
  }

  @Get('analytics/allocations')
  @ApiOperation({ summary: 'List immutable ledger allocations for the authenticated partner' })
  allocations(@CurrentUser() user: RequestUser, @Query() query: PartnerAllocationsQueryDto) {
    return this.analytics.allocations(user.id, query);
  }

  @Get('analytics/question-usage')
  @ApiOperation({ summary: 'Get aggregate-only publisher question usage and correctness metrics' })
  questionUsage(@CurrentUser() user: RequestUser, @Query() query: PartnerQuestionUsageQueryDto) { return this.analytics.questionUsage(user.id, query); }

  @Get('analytics/question-usage/sources')
  @ApiOperation({ summary: 'Get a paginated source breakdown without learner identity' })
  questionUsageSources(@CurrentUser() user: RequestUser, @Query() query: PartnerQuestionUsageQueryDto) { return this.analytics.questionUsageSources(user.id, query); }

  @Get('analytics/question-usage/questions')
  @ApiOperation({ summary: 'Get a paginated frozen-question usage breakdown without learner identity' })
  questionUsageQuestions(@CurrentUser() user: RequestUser, @Query() query: PartnerQuestionUsageQueryDto) { return this.analytics.questionUsageQuestions(user.id, query); }

  @Get('analytics/content')
  @ApiOperation({
    summary: 'List the authenticated publisher agreement-covered content',
  })
  @ApiStandardErrors(400, 401, 403)
  content(
    @CurrentUser() user: RequestUser,
    @Query() query: PartnerContentQueryDto,
  ) {
    return this.analytics.content(user.id, query);
  }

}

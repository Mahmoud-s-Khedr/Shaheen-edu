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
  PartnerEarningsQueryDto,
  PartnerPeriodQueryDto,
  PartnerStatementsQueryDto,
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
    description:
      'All money is EGP minor units. Issued statements are realized; approved-order metrics are estimates.',
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
    summary:
      'Get realized statement and estimated approved-order earnings trends',
  })
  @ApiStandardErrors(400, 401, 403)
  earnings(
    @CurrentUser() user: RequestUser,
    @Query() query: PartnerEarningsQueryDto,
  ) {
    return this.analytics.earnings(user.id, query);
  }

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

  @Get('earnings-statements')
  @ApiOperation({
    summary: 'List the authenticated publisher issued earnings statements',
  })
  @ApiStandardErrors(400, 401, 403)
  statements(
    @CurrentUser() user: RequestUser,
    @Query() query: PartnerStatementsQueryDto,
  ) {
    return this.analytics.statements(user.id, query);
  }
}

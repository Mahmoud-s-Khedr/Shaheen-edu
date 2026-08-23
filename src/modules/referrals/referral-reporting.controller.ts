import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ReferralReportingQueryDto } from './dto/referrals.dto';
import { ReferralReportingService } from './referral-reporting.service';

@ApiTags('partners/referrals') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.PARTNER)
@Controller({ path: 'partners/referrals', version: '1' })
export class PartnerReferralReportingController {
  constructor(private readonly reports: ReferralReportingService) {}
  @Get('report') @ApiOperation({ summary: 'Get privacy-safe aggregate referral conversions, sales, commissions, trends, products, and categories.' }) report(@CurrentUser() user: RequestUser, @Query() query: ReferralReportingQueryDto) { return this.reports.partnerReport(user.id, query); }
  @Get('settlements') @ApiOperation({ summary: 'Get privacy-safe aggregate referral settlement summaries without order rows.' }) settlements(@CurrentUser() user: RequestUser, @Query() query: ReferralReportingQueryDto) { return this.reports.partnerSettlements(user.id, query); }
}

@ApiTags('admin/referral-reporting') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/referral-reporting', version: '1' })
export class AdminReferralReportingController {
  constructor(private readonly reports: ReferralReportingService) {}
  @Get() @ApiOperation({ summary: 'Get aggregate referral reporting for a referral partner; administrative responses are not cohort-suppressed.' }) report(@CurrentUser() user: RequestUser, @Query('partnerUserId') partnerUserId: string, @Query() query: ReferralReportingQueryDto) { return this.reports.adminReport(user, partnerUserId, query); }
}

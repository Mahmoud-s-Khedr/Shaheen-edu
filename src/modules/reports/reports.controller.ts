import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  CreateReportExportDto,
  PlatformReportQueryDto,
  ReportExportsQueryDto,
} from './dto/reports.dto';
import { ReportsService } from './reports.service';
@ApiTags('admin/reports')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('commerce')
  @ApiOperation({ summary: 'Get aggregate platform commerce totals' })
  commerce(
    @CurrentUser() actor: RequestUser,
    @Query() query: PlatformReportQueryDto,
  ) {
    return this.reports.commerce(actor, query);
  }
  @Get('revenue')
  @ApiOperation({
    summary: 'Get aggregate approved revenue and discount totals',
  })
  revenue(
    @CurrentUser() actor: RequestUser,
    @Query() query: PlatformReportQueryDto,
  ) {
    return this.reports.commerce(actor, query);
  }
  @Get('refunds')
  @ApiOperation({
    summary: 'Get aggregate refund request and approved reimbursement totals',
  })
  refunds(
    @CurrentUser() actor: RequestUser,
    @Query() query: PlatformReportQueryDto,
  ) {
    return this.reports.refunds(actor, query);
  }
  @Get('payments')
  @ApiOperation({ summary: 'Get aggregate payment-attempt totals' })
  payments(
    @CurrentUser() actor: RequestUser,
    @Query() query: PlatformReportQueryDto,
  ) {
    return this.reports.payments(actor, query);
  }
  @Get('registrations')
  @ApiOperation({ summary: 'Get aggregate student registration totals' })
  registrations(
    @CurrentUser() actor: RequestUser,
    @Query() query: PlatformReportQueryDto,
  ) {
    return this.reports.registrations(actor, query);
  }
  @Get('active-purchasers')
  @ApiOperation({
    summary: 'Get aggregate approved purchaser and current-access totals',
  })
  activePurchasers(
    @CurrentUser() actor: RequestUser,
    @Query() query: PlatformReportQueryDto,
  ) {
    return this.reports.activePurchasers(actor, query);
  }
  @Get('entitlements')
  @ApiOperation({
    summary:
      'Get aggregate entitlement grant, revocation, expiry, and active-access totals',
  })
  entitlements(
    @CurrentUser() actor: RequestUser,
    @Query() query: PlatformReportQueryDto,
  ) {
    return this.reports.entitlementLifecycle(actor, query);
  }
  @Get('partner-obligations')
  @ApiOperation({
    summary: 'Get aggregate publisher and referral obligation totals',
  })
  obligations(
    @CurrentUser() actor: RequestUser,
    @Query() query: PlatformReportQueryDto,
  ) {
    return this.reports.partnerObligations(actor, query);
  }
  @Post('exports')
  @ApiOperation({ summary: 'Queue a secure CSV report export' })
  createExport(
    @CurrentUser() actor: RequestUser,
    @Body() dto: CreateReportExportDto,
  ) {
    return this.reports.requestExport(actor, dto);
  }
  @Get('exports')
  @ApiOperation({ summary: 'List secure report export jobs' })
  exports(
    @CurrentUser() actor: RequestUser,
    @Query() query: ReportExportsQueryDto,
  ) {
    return this.reports.exports(actor, query);
  }
  @Get('exports/:id/download')
  @ApiOperation({ summary: 'Get a secure report export download URL' })
  download(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.reports.download(actor, id);
  }
  @Post('exports/:id/cancel')
  @ApiOperation({ summary: 'Cancel a queued or running report export' })
  cancel(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.reports.cancel(actor, id);
  }
}

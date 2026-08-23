import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { CreateReportExportDto, PlatformReportQueryDto, ReportExportsQueryDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';
@ApiTags('admin/reports') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('commerce') @ApiOperation({ summary: 'Get aggregate platform commerce totals' }) commerce(@CurrentUser() actor: RequestUser, @Query() query: PlatformReportQueryDto) { return this.reports.commerce(actor, query); }
  @Get('partner-obligations') @ApiOperation({ summary: 'Get aggregate publisher and referral obligation totals' }) obligations(@CurrentUser() actor: RequestUser, @Query() query: PlatformReportQueryDto) { return this.reports.partnerObligations(actor, query); }
  @Post('exports') @ApiOperation({ summary: 'Queue a secure CSV report export' }) createExport(@CurrentUser() actor: RequestUser, @Body() dto: CreateReportExportDto) { return this.reports.requestExport(actor, dto); }
  @Get('exports') exports(@CurrentUser() actor: RequestUser, @Query() query: ReportExportsQueryDto) { return this.reports.exports(actor, query); }
  @Get('exports/:id/download') download(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.reports.download(actor, id); }
  @Post('exports/:id/cancel') cancel(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.reports.cancel(actor, id); }
}

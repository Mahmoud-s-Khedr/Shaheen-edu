import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { AdminAllocationsQueryDto, AssignReconciliationDiscrepancyDto, CreateReconciliationRunDto, CreateSettlementDto, ReconciliationDiscrepanciesQueryDto, ReconciliationRunsQueryDto, ResolveReconciliationDiscrepancyDto, SettlementsQueryDto } from './dto/partner-finance.dto';
import { PartnerFinanceService } from './partner-finance.service';

@ApiTags('admin/partner-finance') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/partner-finance', version: '1' })
export class PartnerFinanceController {
  constructor(private readonly finance: PartnerFinanceService) {}
  @Get('allocations') @ApiOperation({ summary: 'List allocation-ledger rows with administrative filters' }) allocations(@CurrentUser() actor: RequestUser, @Query() query: AdminAllocationsQueryDto) { return this.finance.allocations(actor, query); }
  @Post('settlements') @ApiOperation({ summary: 'Create a settlement for a selected immutable set of payable allocations' }) createSettlement(@CurrentUser() actor: RequestUser, @Body() dto: CreateSettlementDto) { return this.finance.createSettlement(actor, dto); }
  @Post('settlements/:id/mark-paid') @ApiOperation({ summary: 'Mark every allocation in a settlement paid' }) markPaid(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.finance.markSettlementPaid(actor, id); }
  @Get('settlements') @ApiOperation({ summary: 'List partner settlements' }) settlements(@CurrentUser() actor: RequestUser, @Query() query: SettlementsQueryDto) { return this.finance.settlements(actor, query); }
  @Post('reconciliation-runs') @ApiOperation({ summary: 'Create a reconciliation scoped to explicit approved pilot order IDs' }) createReconciliationRun(@CurrentUser() actor: RequestUser, @Body() dto: CreateReconciliationRunDto) { return this.finance.createReconciliationRun(actor, dto); }
  @Post('reconciliation-runs/:id/run') @ApiOperation({ summary: 'Run independent expected-allocation and lifecycle checks for a reconciliation' }) runReconciliation(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.finance.runReconciliation(actor, id); }
  @Get('reconciliation-runs') @ApiOperation({ summary: 'List persistent partner-finance reconciliation runs' }) reconciliationRuns(@CurrentUser() actor: RequestUser, @Query() query: ReconciliationRunsQueryDto) { return this.finance.reconciliationRuns(actor, query); }
  @Get('reconciliation-runs/:id') @ApiOperation({ summary: 'Get a reconciliation run and its discrepancies' }) reconciliationRun(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.finance.reconciliationRun(actor, id); }
  @Get('reconciliation-runs/:id/discrepancies') @ApiOperation({ summary: 'List discrepancies for a reconciliation run' }) discrepancies(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Query() query: ReconciliationDiscrepanciesQueryDto) { return this.finance.discrepancies(actor, id, query); }
  @Patch('reconciliation-discrepancies/:id/assign') @ApiOperation({ summary: 'Assign a reconciliation discrepancy' }) assign(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: AssignReconciliationDiscrepancyDto) { return this.finance.assignDiscrepancy(actor, id, dto); }
  @Patch('reconciliation-discrepancies/:id/resolve') @ApiOperation({ summary: 'Resolve or accept a reconciliation discrepancy' }) resolve(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: ResolveReconciliationDiscrepancyDto) { return this.finance.resolveDiscrepancy(actor, id, dto); }
}

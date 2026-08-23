import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { AdminAllocationsQueryDto, CreateSettlementDto, SettlementsQueryDto } from './dto/partner-finance.dto';
import { PartnerFinanceService } from './partner-finance.service';

@ApiTags('admin/partner-finance') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/partner-finance', version: '1' })
export class PartnerFinanceController {
  constructor(private readonly finance: PartnerFinanceService) {}
  @Get('allocations') @ApiOperation({ summary: 'List allocation-ledger rows with administrative filters' }) allocations(@CurrentUser() actor: RequestUser, @Query() query: AdminAllocationsQueryDto) { return this.finance.allocations(actor, query); }
  @Post('settlements') @ApiOperation({ summary: 'Create a settlement for a selected immutable set of payable allocations' }) createSettlement(@CurrentUser() actor: RequestUser, @Body() dto: CreateSettlementDto) { return this.finance.createSettlement(actor, dto); }
  @Post('settlements/:id/mark-paid') @ApiOperation({ summary: 'Mark every allocation in a settlement paid' }) markPaid(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.finance.markSettlementPaid(actor, id); }
  @Get('settlements') @ApiOperation({ summary: 'List partner settlements' }) settlements(@CurrentUser() actor: RequestUser, @Query() query: SettlementsQueryDto) { return this.finance.settlements(actor, query); }
}

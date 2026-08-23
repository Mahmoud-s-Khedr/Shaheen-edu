import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ApproveRefundDto, AdminRefundRequestsQueryDto, CreateRefundRequestDto, RefundRequestsQueryDto, RejectRefundDto } from './dto/refunds.dto';
import { RefundsService } from './refunds.service';

@ApiTags('student/refunds')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student', version: '1' })
export class StudentRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post('orders/:orderId/refund-requests')
  @ApiOperation({ summary: 'Request a manual refund for complete approved order items; ineligible requests are rejected automatically.' })
  request(@CurrentUser() user: RequestUser, @Param('orderId') orderId: string, @Body() dto: CreateRefundRequestDto) {
    return this.refunds.request(user.id, orderId, dto);
  }

  @Get('refund-requests')
  @ApiOperation({ summary: 'List the authenticated student’s refund requests.' })
  list(@CurrentUser() user: RequestUser, @Query() query: RefundRequestsQueryDto) {
    return this.refunds.own(user.id, query);
  }
}

@ApiTags('admin/refunds')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/refunds', version: '1' })
export class AdminRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  @ApiOperation({ summary: 'List manual refund requests and their policy snapshot.' })
  list(@CurrentUser() user: RequestUser, @Query() query: AdminRefundRequestsQueryDto) {
    return this.refunds.list(user, query);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Record a completed manual refund, revoke associated access, and create partner-ledger reversals.' })
  approve(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ApproveRefundDto) {
    return this.refunds.approve(user, id, dto);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Manually reject an otherwise eligible refund request.' })
  reject(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: RejectRefundDto) {
    return this.refunds.reject(user, id, dto);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { StudentCreditService } from './student-credit.service';
import { StudentRewardsService } from './student-rewards.service';
import {
  StudentCreditBalanceDto,
  StudentCreditHistoryDto,
  StudentRewardsSettingsResponseDto,
  StudentInviteCodeDto,
  StudentReferralListDto,
  StudentReferralAdminListDto,
  StudentReferralAdminDto,
  StudentInviteCodeAdminDto,
  AdjustStudentCreditDto,
  ReviewStudentReferralDto,
  SaveStudentRewardsSettingsDto,
  SetInviteCodeStatusDto,
} from './dto/student-rewards.dto';

@ApiTags('student/rewards')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student', version: '1' })
export class StudentRewardsController {
  constructor(
    private readonly credit: StudentCreditService,
    private readonly rewards: StudentRewardsService,
  ) {}
  @ApiOkResponse({ type: StudentCreditBalanceDto })
  @Get('credit')
  @ApiOperation({
    summary: 'Get available, reserved, expiring credit and debt',
  })
  balance(@CurrentUser() actor: RequestUser) {
    return this.credit.balance(actor.id);
  }
  @ApiOkResponse({ type: StudentCreditHistoryDto })
  @Get('credit/transactions')
  @ApiOperation({ summary: 'List credit movements' })
  history(
    @CurrentUser() actor: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.credit.history(actor.id, query);
  }
  @ApiOkResponse({ type: StudentInviteCodeDto })
  @Get('referrals/code')
  @ApiOperation({ summary: 'Get a personal student invite code' })
  invite(@CurrentUser() actor: RequestUser) {
    return this.rewards.invite(actor.id);
  }
  @ApiOkResponse({ type: StudentReferralListDto })
  @Get('referrals')
  @ApiOperation({
    summary: 'List personal referral statuses without invited student details',
  })
  referrals(
    @CurrentUser() actor: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.rewards.ownReferrals(actor.id, query);
  }
}
@ApiTags('admin/student-rewards')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller({ path: 'admin', version: '1' })
export class AdminStudentRewardsController {
  constructor(
    private readonly credit: StudentCreditService,
    private readonly rewards: StudentRewardsService,
  ) {}
  @ApiOkResponse({ type: StudentRewardsSettingsResponseDto })
  @Get('student-rewards/settings')
  @ApiOperation({ summary: 'Read student credit and rewards configuration' })
  settings() {
    return this.rewards.settings();
  }
  @ApiOkResponse({ type: StudentRewardsSettingsResponseDto })
  @Put('student-rewards/settings')
  @ApiOperation({ summary: 'Replace student credit and rewards configuration' })
  save(
    @CurrentUser() actor: RequestUser,
    @Body() dto: SaveStudentRewardsSettingsDto,
  ) {
    return this.rewards.saveSettings(actor, dto);
  }
  @ApiOkResponse({ type: StudentCreditBalanceDto })
  @Get('students/:id/credit')
  @ApiOperation({ summary: 'Read student credit balance' })
  balance(@Param('id') id: string) {
    return this.credit.balance(id);
  }
  @ApiOkResponse({ type: StudentCreditHistoryDto })
  @Get('students/:id/credit/transactions')
  @ApiOperation({ summary: 'Read student credit history' })
  history(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.credit.history(id, query);
  }
  @ApiCreatedResponse({ type: StudentCreditBalanceDto })
  @Post('students/:id/credit/adjustments')
  @ApiOperation({
    summary: 'Grant or adjust student credit with an audit reason',
  })
  adjust(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: AdjustStudentCreditDto,
  ) {
    return this.credit.adjust(actor, id, dto);
  }
  @ApiOkResponse({ type: StudentReferralAdminListDto })
  @Get('student-referrals')
  @ApiOperation({
    summary: 'Review student referral attribution and suspicious activity',
  })
  referrals(
    @CurrentUser() actor: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.rewards.listReferrals(actor, query);
  }
  @ApiCreatedResponse({ type: StudentReferralAdminDto })
  @Post('student-referrals/:id/review')
  @ApiOperation({ summary: 'Activate or suspend student referral attribution' })
  review(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewStudentReferralDto,
  ) {
    return this.rewards.review(actor, id, dto);
  }
  @ApiOkResponse({ type: StudentInviteCodeAdminDto })
  @Put('students/:id/referral-code/status')
  @ApiOperation({ summary: 'Activate or suspend a student invite code' })
  status(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetInviteCodeStatusDto,
  ) {
    return this.rewards.setInviteStatus(actor, id, dto.isActive, dto.reason);
  }
}

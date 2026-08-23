import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferralProgramStatus, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { CreateReferralCodeDto, CreateReferralCommissionRuleDto, CreateReferralProgramDto, ReferralProgramsQueryDto, UpdateReferralCodeDto, UpdateReferralProgramDto } from './dto/referrals.dto';
import { ReferralsService } from './referrals.service';

@ApiTags('admin/referral-programs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/referral-programs', version: '1' })
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Post() @ApiOperation({ summary: 'Create a draft referral program' }) create(@CurrentUser() actor: RequestUser, @Body() dto: CreateReferralProgramDto) { return this.referrals.createProgram(actor, dto); }
  @Get() @ApiOperation({ summary: 'List referral programs' }) list(@CurrentUser() actor: RequestUser, @Query() query: ReferralProgramsQueryDto) { return this.referrals.listPrograms(actor, query); }
  @Get(':id') @ApiOperation({ summary: 'Get a referral program with codes and rules' }) get(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.referrals.getProgram(actor, id); }
  @Patch(':id') @ApiOperation({ summary: 'Update a draft referral program' }) update(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: UpdateReferralProgramDto) { return this.referrals.updateProgram(actor, id, dto); }
  @Post(':id/activate') activate(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.referrals.activateProgram(actor, id); }
  @Post(':id/suspend') suspend(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.referrals.setProgramStatus(actor, id, ReferralProgramStatus.SUSPENDED); }
  @Post(':id/end') end(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.referrals.setProgramStatus(actor, id, ReferralProgramStatus.ENDED); }
  @Post(':id/codes') createCode(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: CreateReferralCodeDto) { return this.referrals.createCode(actor, id, dto); }
  @Patch('codes/:id') updateCode(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: UpdateReferralCodeDto) { return this.referrals.updateCode(actor, id, dto); }
  @Post(':id/rules') createRule(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: CreateReferralCommissionRuleDto) { return this.referrals.createRule(actor, id, dto); }
  @Post(':id/rules/:ruleId/activate') activateRule(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('ruleId') ruleId: string) { return this.referrals.activateRule(actor, id, ruleId); }
}

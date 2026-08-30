import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferralProgramStatus, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  AddReferralReviewNoteDto,
  AssignReferralReviewFlagDto,
  CreateManualReferralReviewFlagDto,
  CreateReferralCodeDto,
  CreateReferralCommissionRuleDto,
  CreateReferralProgramDto,
  CreateReferralReviewRuleDto,
  ReferralReviewFlagsQueryDto,
  ReferralProgramsQueryDto,
  ResolveReferralReviewFlagDto,
  UpdateReferralCodeDto,
  UpdateReferralProgramDto,
  UpdateReferralReviewRuleDto,
} from './dto/referrals.dto';
import { ReferralsService } from './referrals.service';

@ApiTags('admin/referral-programs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/referral-programs', version: '1' })
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Post() @ApiOperation({ summary: 'Create a draft referral program' }) create(
    @CurrentUser() actor: RequestUser,
    @Body() dto: CreateReferralProgramDto,
  ) {
    return this.referrals.createProgram(actor, dto);
  }
  @Get() @ApiOperation({ summary: 'List referral programs' }) list(
    @CurrentUser() actor: RequestUser,
    @Query() query: ReferralProgramsQueryDto,
  ) {
    return this.referrals.listPrograms(actor, query);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get a referral program with codes and rules' })
  get(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.referrals.getProgram(actor, id);
  }
  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft referral program' })
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateReferralProgramDto,
  ) {
    return this.referrals.updateProgram(actor, id, dto);
  }
  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate a referral program' })
  activate(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.referrals.activateProgram(actor, id);
  }
  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend a referral program' })
  suspend(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.referrals.setProgramStatus(
      actor,
      id,
      ReferralProgramStatus.SUSPENDED,
    );
  }
  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume a referral program' })
  resume(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.referrals.resumeProgram(actor, id);
  }
  @Post(':id/end') @ApiOperation({ summary: 'End a referral program' }) end(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
  ) {
    return this.referrals.setProgramStatus(
      actor,
      id,
      ReferralProgramStatus.ENDED,
    );
  }
  @Post(':id/codes')
  @ApiOperation({ summary: 'Create a referral code' })
  createCode(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateReferralCodeDto,
  ) {
    return this.referrals.createCode(actor, id, dto);
  }
  @Patch('codes/:id')
  @ApiOperation({ summary: 'Update a referral code' })
  updateCode(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateReferralCodeDto,
  ) {
    return this.referrals.updateCode(actor, id, dto);
  }
  @Post('codes/:id/suspend')
  @ApiOperation({ summary: 'Suspend a referral code' })
  suspendCode(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.referrals.setCodeActive(actor, id, false);
  }
  @Post('codes/:id/resume')
  @ApiOperation({ summary: 'Resume a referral code' })
  resumeCode(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.referrals.setCodeActive(actor, id, true);
  }
  @Post(':id/rules')
  @ApiOperation({ summary: 'Create a referral commission rule' })
  createRule(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateReferralCommissionRuleDto,
  ) {
    return this.referrals.createRule(actor, id, dto);
  }
  @Post(':id/rules/:ruleId/activate')
  @ApiOperation({ summary: 'Activate a referral commission rule' })
  activateRule(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.referrals.activateRule(actor, id, ruleId);
  }
  @Post(':id/review-rules')
  @ApiOperation({ summary: 'Create a referral review rule' })
  createReviewRule(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateReferralReviewRuleDto,
  ) {
    return this.referrals.createReviewRule(actor, id, dto);
  }
  @Patch('review-rules/:id')
  @ApiOperation({ summary: 'Update a referral review rule' })
  updateReviewRule(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateReferralReviewRuleDto,
  ) {
    return this.referrals.updateReviewRule(actor, id, dto);
  }
  @Get('review-flags')
  @ApiOperation({ summary: 'List referral review flags' })
  reviewFlags(
    @CurrentUser() actor: RequestUser,
    @Query() query: ReferralReviewFlagsQueryDto,
  ) {
    return this.referrals.listReviewFlags(actor, query);
  }
  @Post('attributions/:id/review-flags')
  @ApiOperation({ summary: 'Create a manual referral review flag' })
  createManualFlag(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateManualReferralReviewFlagDto,
  ) {
    return this.referrals.createManualFlag(actor, id, dto);
  }
  @Patch('review-flags/:id/assign')
  @ApiOperation({ summary: 'Assign a referral review flag' })
  assignFlag(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: AssignReferralReviewFlagDto,
  ) {
    return this.referrals.assignReviewFlag(actor, id, dto);
  }
  @Post('review-flags/:id/notes')
  @ApiOperation({ summary: 'Add a referral review note' })
  addFlagNote(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: AddReferralReviewNoteDto,
  ) {
    return this.referrals.addReviewNote(actor, id, dto);
  }
  @Patch('review-flags/:id/resolve')
  @ApiOperation({ summary: 'Resolve a referral review flag' })
  resolveFlag(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: ResolveReferralReviewFlagDto,
  ) {
    return this.referrals.resolveReviewFlag(actor, id, dto);
  }
}

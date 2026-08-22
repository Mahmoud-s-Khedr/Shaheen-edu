import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ApplyAiQuestionExplanationRunDto, CreateAiQuestionExplanationRunDto, RejectAiQuestionExplanationRunDto } from './dto/question-ai-explanation.dto';
import { QuestionAiExplanationsService } from './question-ai-explanations.service';

@ApiTags('admin/questions/ai') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/questions/:questionId/ai/re-answer', version: '1' })
export class QuestionAiExplanationsController {
  constructor(private readonly service: QuestionAiExplanationsService) {}
  @Post() @ApiOperation({ summary: 'Generate one AI answer/explanation review run' }) create(@CurrentUser() actor: RequestUser, @Param('questionId') questionId: string, @Body() dto: CreateAiQuestionExplanationRunDto) { return this.service.create(actor, questionId, dto); }
  @Get() @ApiOperation({ summary: 'List retained AI re-answer review runs' }) list(@CurrentUser() actor: RequestUser, @Param('questionId') questionId: string) { return this.service.list(actor, questionId); }
  @Get(':runId') @ApiOperation({ summary: 'Get an AI re-answer review run' }) get(@CurrentUser() actor: RequestUser, @Param('questionId') questionId: string, @Param('runId') runId: string) { return this.service.get(actor, questionId, runId); }
  @Post(':runId/apply') @ApiOperation({ summary: 'Apply reviewed answer and/or explanation' }) apply(@CurrentUser() actor: RequestUser, @Param('questionId') questionId: string, @Param('runId') runId: string, @Body() dto: ApplyAiQuestionExplanationRunDto) { return this.service.apply(actor, questionId, runId, dto); }
  @Post(':runId/reject') @ApiOperation({ summary: 'Reject an AI re-answer review run' }) reject(@CurrentUser() actor: RequestUser, @Param('questionId') questionId: string, @Param('runId') runId: string, @Body() dto: RejectAiQuestionExplanationRunDto) { return this.service.reject(actor, questionId, runId, dto); }
}

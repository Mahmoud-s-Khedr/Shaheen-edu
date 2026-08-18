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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentParentSession,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParentAuthGuard } from '../../common/guards/parent-auth.guard';
import { ParentSelectedChildGuard } from '../../common/guards/parent-selected-child.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type {
  RequestParentSession,
  RequestUser,
} from '../../common/types/request-with-user.types';
import { LearningService } from './learning.service';
import {
  PracticeScopeQueryDto,
  ParentAnalyticsScopeQueryDto,
  SubmitQuestionAttemptDto,
  UpdateContentStudyStateDto,
} from './dto/learning.dto';

@ApiTags('student/learning')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student', version: '1' })
export class LearningController {
  constructor(private readonly learning: LearningService) {}
  @Post('content-items/:id/complete')
  @ApiOperation({ summary: 'Mark an accessible content item complete' })
  complete(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.learning.completeContent(user.id, id);
  }
  @Put('content-items/:id/study-state')
  @ApiOperation({
    summary: 'Record study activity and optional video resume position',
  })
  studyState(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateContentStudyStateDto,
  ) {
    return this.learning.updateStudyState(user.id, id, dto);
  }
  @Get('learning/continue')
  @ApiOperation({
    summary: 'Get the most recently studied accessible content item',
  })
  continue(@CurrentUser() user: RequestUser) {
    return this.learning.continueStudying(user.id);
  }
  @Get('progress')
  @ApiOperation({ summary: 'Get current-grade learning completion' })
  progress(@CurrentUser() user: RequestUser) {
    return this.learning.progress(user.id);
  }
  @Get('library/:targetType/:targetId/progress')
  @ApiOperation({
    summary: 'Get detailed progress for an owned course or chapter',
  })
  libraryProgress(
    @CurrentUser() user: RequestUser,
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
  ) {
    return this.learning.libraryProgress(user.id, targetType, targetId);
  }
  @Get('practice/questions')
  @ApiOperation({
    summary: 'List eligible direct-practice questions for one hierarchy scope',
  })
  questions(
    @CurrentUser() user: RequestUser,
    @Query() query: PracticeScopeQueryDto,
  ) {
    return this.learning.questions(user.id, query);
  }
  @Post('practice/questions/:questionId/attempts')
  @ApiOperation({ summary: 'Submit an immutable practice answer attempt' })
  attempt(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
    @Body() dto: SubmitQuestionAttemptDto,
  ) {
    return this.learning.attempt(user.id, questionId, dto.optionIds);
  }
  @Get('practice/questions/:questionId/assets/:assetId/access')
  @ApiOperation({
    summary:
      'Get protected access to an eligible canonical content-block asset (legacy attachments are also supported)',
  })
  assetAccess(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.learning.questionAssetAccess(user.id, questionId, assetId);
  }
  @Get('video-assets/:assetId/playback')
  @ApiOperation({
    summary:
      'Get playback for a video reachable through student-authorized content',
  })
  videoPlayback(
    @CurrentUser() user: RequestUser,
    @Param('assetId') assetId: string,
  ) {
    return this.learning.videoPlaybackAccess(user.id, assetId);
  }
  @Get('practice/questions/:questionId/attempts')
  @ApiOperation({ summary: 'List personal attempt history for a question' })
  attempts(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
    @Query() query: PracticeScopeQueryDto,
  ) {
    return this.learning.attempts(user.id, questionId, query);
  }
  @Get('performance')
  @ApiOperation({ summary: 'Get current-grade direct-practice performance' })
  performance(@CurrentUser() user: RequestUser) {
    return this.learning.performance(user.id);
  }
}

@ApiTags('parent/learning')
@Public()
@ApiBearerAuth()
@UseGuards(ParentAuthGuard, ParentSelectedChildGuard)
@Controller({ path: 'parent/selected-child', version: '1' })
export class ParentLearningController {
  constructor(private readonly learning: LearningService) {}
  @Get('performance')
  @ApiOperation({ summary: 'Get selected child learning summary' })
  performance(@CurrentParentSession() parent: RequestParentSession) {
    return this.learning.parentPerformance(parent);
  }
  @Get('analytics/scopes')
  @ApiOperation({
    summary: 'List selected child approved purchase analytics scopes',
  })
  analyticsScopes(
    @CurrentParentSession() parent: RequestParentSession,
    @Query() query: ParentAnalyticsScopeQueryDto,
  ) {
    return this.learning.parentAnalyticsScopes(parent, query);
  }
  @Get('analytics/content')
  @ApiOperation({ summary: 'Get purchased-scope content progress' })
  analyticsContent(
    @CurrentParentSession() parent: RequestParentSession,
    @Query() query: ParentAnalyticsScopeQueryDto,
  ) {
    return this.learning.parentAnalyticsContent(parent, query);
  }
  @Get('analytics/assessments')
  @ApiOperation({ summary: 'Get purchased-scope assessment performance' })
  analyticsAssessments(
    @CurrentParentSession() parent: RequestParentSession,
    @Query() query: ParentAnalyticsScopeQueryDto,
  ) {
    return this.learning.parentAnalyticsAssessments(parent, query);
  }
  @Get('analytics/practice')
  @ApiOperation({ summary: 'Get purchased-scope direct-practice performance' })
  analyticsPractice(
    @CurrentParentSession() parent: RequestParentSession,
    @Query() query: ParentAnalyticsScopeQueryDto,
  ) {
    return this.learning.parentAnalyticsPractice(parent, query);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import { AssessmentsService } from './assessments.service';
import {
  AdminAssessmentDetailDto,
  AssessmentAttemptStateDto,
  AssessmentAnalyticsQueryDto,
  AssessmentAnalyticsResponseDto,
  AssessmentResultQueryDto,
  AssessmentDetailDto,
  AssessmentResultDto,
  AutosaveAnswerDto,
  ReportActiveTimeDto,
  CreateCustomAssessmentDto,
  GradeLongAnswerDto,
  GenerateAdminStandardAssessmentDto,
  GenerateStudentAssessmentDto,
  GenerateAiPromptAssessmentDto,
  CreateSelectedTutorAssessmentDto,
  CommunityIncorrectQueryDto,
  CreateQuestionReportDto,
  QueryQuestionReportDto,
  ReviewQuestionReportDto,
  IdDeletedResponseDto,
  PaginatedAdminAssessmentsResponseDto,
  PaginatedAssessmentsResponseDto,
  QueryAdminAssessmentDto,
  QueryAssessmentDto,
  RenameAssessmentDto,
  UpdateAdminAssessmentDto,
  UpdateQuestionNoteDto,
} from './dto/assessments.dto';

@ApiTags('student/assessments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/assessments', version: '1' })
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Generate a standard (random-sample) quiz/exam from a chosen scope',
  })
  @ApiCreatedResponse({ type: AssessmentDetailDto })
  @ApiStandardErrors(400, 401, 403, 404)
  generate(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateStudentAssessmentDto,
  ) {
    return this.assessments.generateStandard(user.id, dto);
  }

  @Post('ai-prompt')
  @ApiOperation({
    summary:
      'Generate a private quiz from a student prompt and permitted scope',
  })
  aiPrompt(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateAiPromptAssessmentDto,
  ) {
    return this.assessments.generateAiPrompt(user.id, dto);
  }

  @Get('community-most-incorrect')
  @ApiOperation({
    summary:
      'List entitled community-most-incorrect question cards without answers',
  })
  communityMostIncorrect(
    @CurrentUser() user: RequestUser,
    @Query() query: CommunityIncorrectQueryDto,
  ) {
    return this.assessments.communityMostIncorrect(user.id, query);
  }

  @Post('community-tutor')
  @ApiOperation({
    summary: 'Create a tutor assessment from accessible ranked question cards',
  })
  communityTutor(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSelectedTutorAssessmentDto,
  ) {
    return this.assessments.createSelectedTutorAssessment(user.id, dto);
  }

  @Get('question-banks')
  @ApiOperation({
    summary: 'List accessible question banks, optionally within one subject',
  })
  @ApiStandardErrors(401, 403)
  questionBanks(
    @CurrentUser() user: RequestUser,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.assessments.listStudentQuestionBanks(user.id, subjectId);
  }

  @Get('question-sources')
  @ApiOperation({
    summary: 'List accessible sources in a selected question bank',
  })
  @ApiStandardErrors(401, 403, 404)
  questionSources(
    @CurrentUser() user: RequestUser,
    @Query('questionBankId') questionBankId: string,
  ) {
    return this.assessments.listStudentQuestionSources(user.id, questionBankId);
  }

  @Post('question-marks/:questionId')
  @ApiOperation({ summary: 'Mark an accessible question' })
  @ApiStandardErrors(401, 403, 404)
  markQuestion(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
  ) {
    return this.assessments.markQuestion(user.id, questionId);
  }

  @Get('question-marks')
  @ApiOperation({
    summary: 'List the current student’s accessible marked questions',
  })
  @ApiStandardErrors(401, 403)
  questionMarks(@CurrentUser() user: RequestUser) {
    return this.assessments.listMarkedQuestions(user.id);
  }

  @Delete('question-marks/:questionId')
  @ApiOperation({ summary: 'Remove a question mark' })
  @ApiStandardErrors(401, 403)
  unmarkQuestion(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
  ) {
    return this.assessments.unmarkQuestion(user.id, questionId);
  }

  @Put('question-notes/:questionId')
  @ApiOperation({
    summary: 'Create or update a private note for an accessible question',
  })
  @ApiStandardErrors(400, 401, 403, 404)
  saveQuestionNote(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionNoteDto,
  ) {
    return this.assessments.saveQuestionNote(user.id, questionId, dto.body);
  }

  @Delete('question-notes/:questionId')
  @ApiOperation({
    summary: 'Delete the current student’s private question note',
  })
  @ApiStandardErrors(401, 403, 404)
  deleteQuestionNote(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
  ) {
    return this.assessments.deleteQuestionNote(user.id, questionId);
  }

  @Post('question-reports/:questionId')
  @ApiOperation({
    summary: 'Report an accessible authored or assessment-snapshot question',
  })
  createQuestionReport(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
    @Body() dto: CreateQuestionReportDto,
  ) {
    return this.assessments.createQuestionReport(user.id, questionId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List own and publicly visible assessments' })
  @ApiOkResponse({ type: PaginatedAssessmentsResponseDto })
  @ApiStandardErrors(401, 403)
  list(@CurrentUser() user: RequestUser, @Query() query: QueryAssessmentDto) {
    return this.assessments.list(user.id, query);
  }

  @Get('analytics/summary')
  @ApiOperation({
    summary: 'Get completed-assessment subject, chapter, and topic analytics',
  })
  @ApiOkResponse({ type: AssessmentAnalyticsResponseDto })
  @ApiStandardErrors(401, 403)
  analytics(
    @CurrentUser() user: RequestUser,
    @Query() query: AssessmentAnalyticsQueryDto,
  ) {
    return this.assessments.analytics(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an assessment by ID' })
  @ApiOkResponse({ type: AssessmentDetailDto })
  @ApiStandardErrors(401, 403, 404)
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessments.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename an owned assessment' })
  @ApiOkResponse({ type: AssessmentDetailDto })
  @ApiStandardErrors(400, 401, 403, 404)
  rename(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RenameAssessmentDto,
  ) {
    return this.assessments.rename(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an owned assessment' })
  @ApiOkResponse({ type: IdDeletedResponseDto })
  @ApiStandardErrors(401, 403, 404)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessments.remove(user.id, id);
  }

  @Post(':id/attempts/start')
  @ApiOperation({ summary: 'Start or resume the attempt for an assessment' })
  @ApiCreatedResponse({ type: AssessmentAttemptStateDto })
  @ApiStandardErrors(401, 403, 404, 409)
  start(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessments.startAttempt(user.id, id);
  }

  @Get(':id/attempts/current')
  @ApiOperation({ summary: 'Get the current (resumable) attempt state' })
  @ApiOkResponse({ type: AssessmentAttemptStateDto })
  @ApiStandardErrors(401, 403, 404)
  current(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessments.currentAttemptState(user.id, id);
  }

  @Get(':id/questions/:questionId/assets/:assetId/access')
  @ApiOperation({
    summary: 'Get protected access to an assessment-question attachment',
  })
  @ApiStandardErrors(401, 403, 404, 409)
  attachmentAccess(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.assessments.questionAttachmentAccess(
      user.id,
      id,
      questionId,
      assetId,
    );
  }

  @Post(':id/attempts/current/answers/:questionId')
  @ApiOperation({ summary: 'Autosave a selected answer' })
  @ApiCreatedResponse()
  @ApiStandardErrors(400, 401, 403, 404, 409)
  autosave(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: AutosaveAnswerDto,
  ) {
    return this.assessments.autosaveAnswer(user.id, id, questionId, dto);
  }

  @Patch(':id/attempts/current/questions/:questionId/active-time')
  @ApiOperation({
    summary:
      'Record monotonic active time for a question in a resumable attempt',
  })
  @ApiOkResponse()
  @ApiStandardErrors(400, 401, 403, 404, 409)
  reportActiveTime(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: ReportActiveTimeDto,
  ) {
    return this.assessments.reportActiveTime(user.id, id, questionId, dto);
  }

  @Post(':id/attempts/current/submit')
  @ApiOperation({ summary: 'Submit and score the attempt' })
  @ApiCreatedResponse()
  @ApiStandardErrors(401, 403, 404)
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessments.submitAttempt(user.id, id);
  }

  @Get(':id/attempts/current/result')
  @ApiOperation({ summary: 'Get the full result/review after submission' })
  @ApiOkResponse({ type: AssessmentResultDto })
  @ApiStandardErrors(401, 403, 404, 409)
  result(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query() query: AssessmentResultQueryDto,
  ) {
    return this.assessments.result(user.id, id, query);
  }
}

@ApiTags('admin/assessments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/assessments', version: '1' })
export class AdminAssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get('grading/pending')
  @ApiOperation({
    summary: 'List submitted long answers awaiting manual grading',
  })
  pendingGrades(@CurrentUser() user: RequestUser) {
    return this.assessments.pendingGrades(user);
  }

  @Get('question-reports')
  @ApiOperation({ summary: 'List student question reports for moderation' })
  questionReports(
    @CurrentUser() user: RequestUser,
    @Query() query: QueryQuestionReportDto,
  ) {
    return this.assessments.listQuestionReports(user, query);
  }

  @Post('question-reports/:reportId/review')
  @ApiOperation({ summary: 'Assign and transition a student question report' })
  reviewQuestionReport(
    @CurrentUser() user: RequestUser,
    @Param('reportId') reportId: string,
    @Body() dto: ReviewQuestionReportDto,
  ) {
    return this.assessments.reviewQuestionReport(user, reportId, dto);
  }

  @Post('grading/answers/:answerId')
  @ApiOperation({ summary: 'Award points to a submitted long answer' })
  grade(
    @CurrentUser() user: RequestUser,
    @Param('answerId') answerId: string,
    @Body() dto: GradeLongAnswerDto,
  ) {
    return this.assessments.gradeLongAnswer(user, answerId, dto);
  }

  @Post('standard')
  @ApiOperation({
    summary: 'Create a quiz/exam via random sample from the question bank',
  })
  @ApiCreatedResponse({ type: AdminAssessmentDetailDto })
  @ApiStandardErrors(400, 401, 403)
  createStandard(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateAdminStandardAssessmentDto,
  ) {
    return this.assessments.createStandard(user, dto);
  }

  @Post('custom')
  @ApiOperation({
    summary:
      'Create a quiz/exam by hand-picking questions from the question bank',
  })
  @ApiCreatedResponse({ type: AdminAssessmentDetailDto })
  @ApiStandardErrors(400, 401, 403)
  createCustom(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCustomAssessmentDto,
  ) {
    return this.assessments.createCustom(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List admin-created assessments' })
  @ApiOkResponse({ type: PaginatedAdminAssessmentsResponseDto })
  @ApiStandardErrors(401, 403)
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: QueryAdminAssessmentDto,
  ) {
    return this.assessments.listAdmin(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an admin-created assessment, including correct answers',
  })
  @ApiOkResponse({ type: AdminAssessmentDetailDto })
  @ApiStandardErrors(401, 403, 404)
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessments.getAdmin(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft assessment (title, mode, timer)' })
  @ApiOkResponse({ type: AdminAssessmentDetailDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdminAssessmentDto,
  ) {
    return this.assessments.updateAdmin(user, id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a draft assessment' })
  @ApiCreatedResponse({ type: AdminAssessmentDetailDto })
  @ApiStandardErrors(401, 403, 404, 409)
  publish(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessments.publish(user, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a published assessment' })
  @ApiCreatedResponse({ type: AdminAssessmentDetailDto })
  @ApiStandardErrors(401, 403, 404, 409)
  archive(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessments.archive(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a never-published draft assessment' })
  @ApiOkResponse({ type: IdDeletedResponseDto })
  @ApiStandardErrors(401, 403, 404, 409)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessments.deleteAdmin(user, id);
  }
}

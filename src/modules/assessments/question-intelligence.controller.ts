import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { AssessmentsService } from './assessments.service';
import {
  CommunityIncorrectQueryDto,
  CreateQuestionReportDto,
  QueryQuestionReportDto,
  ReviewQuestionReportDto,
} from './dto/assessments.dto';

@ApiTags('student/questions')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/questions', version: '1' })
export class QuestionIntelligenceController {
  constructor(private readonly assessments: AssessmentsService) {}

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

  @Post(':questionId/reports')
  @ApiOperation({
    summary: 'Report an accessible authored or assessment-snapshot question',
  })
  report(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
    @Body() dto: CreateQuestionReportDto,
  ) {
    return this.assessments.createQuestionReport(user.id, questionId, dto);
  }
}

@ApiTags('student/voice')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/voice', version: '1' })
export class StudentVoiceController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Post('transcriptions')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary:
      'Transcribe a student voice-answer recording without retaining audio',
  })
  async transcribe(
    @CurrentUser() user: RequestUser,
    @Req() req: any,
    @Query('language') language?: string,
  ) {
    const part = await req.file();
    if (!part) throw new BadRequestException('An audio file is required');
    const bytes = await part.toBuffer();
    if (part.file.truncated)
      throw new BadRequestException('Audio file exceeds the upload limit');
    return this.assessments.transcribeStudentAudio(user.id, {
      bytes,
      mimeType: part.mimetype,
      language,
    });
  }
}

@ApiTags('admin/question-reports')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/question-reports', version: '1' })
export class AdminQuestionReportsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List student question reports for moderation' })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: QueryQuestionReportDto,
  ) {
    return this.assessments.listQuestionReports(user, query);
  }

  @Post(':reportId/review')
  @ApiOperation({ summary: 'Assign and transition a student question report' })
  review(
    @CurrentUser() user: RequestUser,
    @Param('reportId') reportId: string,
    @Body() dto: ReviewQuestionReportDto,
  ) {
    return this.assessments.reviewQuestionReport(user, reportId, dto);
  }
}

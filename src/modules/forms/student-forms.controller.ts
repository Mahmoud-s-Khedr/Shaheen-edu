import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import {
  ActiveFormDto,
  FormSubmissionDto,
  FormSubmittedDto,
} from './forms-response.dto';
import { SubmitFormDto } from './forms.dto';
import { FormsService } from './forms.service';

@ApiTags('student/forms')
@ApiBearerAuth()
@ApiStandardErrors(400, 401, 403, 404, 409)
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/forms', version: '1' })
export class StudentFormsController {
  constructor(private readonly forms: FormsService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get the active form and own submission status' })
  @ApiOkResponse({ type: ActiveFormDto })
  active(@CurrentUser() user: RequestUser) {
    return this.forms.active({ type: 'STUDENT', studentUserId: user.id });
  }

  @Post(':id/submissions')
  @ApiOperation({
    summary: 'Submit a form once',
    description: 'Final submission. One response per student per form.',
  })
  @ApiCreatedResponse({ type: FormSubmittedDto })
  submit(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SubmitFormDto,
  ) {
    return this.forms.submit(
      { type: 'STUDENT', studentUserId: user.id },
      id,
      dto,
    );
  }

  @Get(':id/submission')
  @ApiOperation({
    summary: 'Read own submitted answers, including after closure',
  })
  @ApiOkResponse({ type: FormSubmissionDto })
  submission(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.forms.ownSubmission(
      { type: 'STUDENT', studentUserId: user.id },
      id,
    );
  }
}

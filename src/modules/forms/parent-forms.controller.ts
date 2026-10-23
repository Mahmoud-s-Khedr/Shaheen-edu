import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentParentSession } from '../../common/decorators/current-user.decorator';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import type { RequestParentSession } from '../../common/types/request-with-user.types';
import { Public } from '../../common/decorators/public.decorator';
import { ParentAuthGuard } from '../../common/guards/parent-auth.guard';
import {
  ActiveFormDto,
  FormSubmissionDto,
  FormSubmittedDto,
} from './forms-response.dto';
import { SubmitFormDto } from './forms.dto';
import { FormsService } from './forms.service';

@ApiTags('parent/forms')
@ApiBearerAuth()
@ApiStandardErrors(400, 401, 403, 404, 409)
@Public()
@UseGuards(ParentAuthGuard)
@Controller({ path: 'parent/forms', version: '1' })
export class ParentFormsController {
  constructor(private readonly forms: FormsService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get the active form and own submission status' })
  @ApiOkResponse({ type: ActiveFormDto })
  active(@CurrentParentSession() user: RequestParentSession) {
    return this.forms.active({
      type: 'PARENT',
      parentPhoneNormalized: user.parentPhoneNormalized,
    });
  }

  @Post(':id/submissions')
  @ApiOperation({
    summary: 'Submit a form once',
    description:
      'Final submission. One response per parent phone number, across sessions and children. No selected child required.',
  })
  @ApiCreatedResponse({ type: FormSubmittedDto })
  submit(
    @CurrentParentSession() user: RequestParentSession,
    @Param('id') id: string,
    @Body() dto: SubmitFormDto,
  ) {
    return this.forms.submit(
      { type: 'PARENT', parentPhoneNormalized: user.parentPhoneNormalized },
      id,
      dto,
    );
  }

  @Get(':id/submission')
  @ApiOperation({
    summary: 'Read own submitted answers, including after closure',
  })
  @ApiOkResponse({ type: FormSubmissionDto })
  submission(
    @CurrentParentSession() user: RequestParentSession,
    @Param('id') id: string,
  ) {
    return this.forms.ownSubmission(
      { type: 'PARENT', parentPhoneNormalized: user.parentPhoneNormalized },
      id,
    );
  }
}

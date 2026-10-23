import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  CreateFormDto,
  FormResultsQueryDto,
  QueryFormsDto,
  QueryFormSubmissionsDto,
  UpdateFormDto,
} from './forms.dto';
import {
  FormDeletedDto,
  FormDetailDto,
  FormResultsDto,
  FormsPageDto,
  FormSubmissionDto,
  FormSubmissionsPageDto,
} from './forms-response.dto';
import { FormsService } from './forms.service';

@ApiTags('admin/forms')
@ApiBearerAuth()
@ApiStandardErrors(400, 401, 403, 404, 409)
@UseGuards(SuperAdminGuard)
@Controller({ path: 'admin/forms', version: '1' })
export class AdminFormsController {
  constructor(private readonly forms: FormsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a form draft' })
  @ApiCreatedResponse({ type: FormDetailDto })
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateFormDto) {
    return this.forms.create(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List forms with submission counts' })
  @ApiOkResponse({ type: FormsPageDto })
  list(@CurrentUser() actor: RequestUser, @Query() query: QueryFormsDto) {
    return this.forms.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a complete form' })
  @ApiOkResponse({ type: FormDetailDto })
  get(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.forms.get(actor, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a draft',
    description:
      'Supplied questions replace the complete question list; array order controls display order. Retain existing question/option IDs or omit IDs for new entries. Activated and closed forms are immutable.',
  })
  @ApiOkResponse({ type: FormDetailDto })
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateFormDto,
  ) {
    return this.forms.update(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft form' })
  @ApiOkResponse({ type: FormDeletedDto })
  delete(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.forms.delete(actor, id);
  }

  @Post(':id/activate')
  @ApiOperation({
    summary: 'Activate a draft and atomically close the previous active form',
  })
  @ApiCreatedResponse({ type: FormDetailDto })
  activate(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.forms.activate(actor, id);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close the active form and stop submissions' })
  @ApiCreatedResponse({ type: FormDetailDto })
  close(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.forms.close(actor, id);
  }

  @Get(':id/submissions')
  @ApiOperation({
    summary: 'List submissions with optional respondent-type filter',
  })
  @ApiOkResponse({ type: FormSubmissionsPageDto })
  submissions(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Query() query: QueryFormSubmissionsDto,
  ) {
    return this.forms.submissions(actor, id, query);
  }

  @Get(':id/submissions/:submissionId')
  @ApiOperation({ summary: 'Read a complete submission' })
  @ApiOkResponse({ type: FormSubmissionDto })
  submission(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.forms.submission(actor, id, submissionId);
  }

  @Get(':id/results')
  @ApiOperation({
    summary: 'Get response totals and choice statistics',
    description:
      'Text answers are available through individual submissions. Choice percentages use the number answering that question as denominator.',
  })
  @ApiOkResponse({ type: FormResultsDto })
  results(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Query() query: FormResultsQueryDto,
  ) {
    return this.forms.results(actor, id, query);
  }
}

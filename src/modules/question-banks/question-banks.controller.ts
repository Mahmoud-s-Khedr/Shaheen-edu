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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  CreateQuestionBankDto,
  CreateQuestionContextDto,
  CreateQuestionDto,
  CreateQuestionOptionDto,
  CreateQuestionSourceDto,
  QueryQuestionBankDto,
  QueryQuestionDto,
  QueryQuestionSourceDto,
  RejectQuestionDto,
  ReorderQuestionAssetsDto,
  ReorderQuestionOptionsDto,
  SetQuestionVideoLinkDto,
  UpdateQuestionBankDto,
  UpdateQuestionContextDto,
  UpdateQuestionDto,
  UpdateQuestionOptionDto,
  UpdateQuestionSourceDto,
} from './dto/question-banks.dto';
import { QuestionBanksService } from './question-banks.service';

@ApiTags('admin/question-banks')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/question-banks', version: '1' })
export class QuestionBanksController {
  constructor(private readonly service: QuestionBanksService) {}
  @Post('sources')
  @ApiOperation({ summary: 'Create a question source' })
  createSource(
    @CurrentUser() a: RequestUser,
    @Body() d: CreateQuestionSourceDto,
  ) {
    return this.service.createSource(a, d);
  }
  @Get('sources')
  @ApiOperation({ summary: 'List question sources' })
  listSources(
    @CurrentUser() a: RequestUser,
    @Query() q: QueryQuestionSourceDto,
  ) {
    return this.service.listSources(a, q);
  }
  @Get('sources/:id')
  @ApiOperation({ summary: 'Get a question source' })
  getSource(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.getSource(a, id);
  }
  @Patch('sources/:id')
  @ApiOperation({ summary: 'Update a question source' })
  updateSource(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Body() d: UpdateQuestionSourceDto,
  ) {
    return this.service.updateSource(a, id, d);
  }
  @Post('sources/:id/publish')
  @ApiOperation({ summary: 'Publish a question source' })
  publishSource(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.publishResource(a, 'source', id);
  }
  @Post('sources/:id/archive')
  @ApiOperation({ summary: 'Archive a question source' })
  archiveSource(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.archiveResource(a, 'source', id);
  }
  @Post('sources/:id/restore')
  @ApiOperation({ summary: 'Restore a question source' })
  restoreSource(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.restoreResource(a, 'source', id);
  }
  @Delete('sources/:id')
  @ApiOperation({ summary: 'Delete an eligible draft question source' })
  deleteSource(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.deleteResource(a, 'source', id);
  }
  @Post() @ApiOperation({ summary: 'Create a question bank' }) createBank(
    @CurrentUser() a: RequestUser,
    @Body() d: CreateQuestionBankDto,
  ) {
    return this.service.createBank(a, d);
  }
  @Get() @ApiOperation({ summary: 'List question banks' }) listBanks(
    @CurrentUser() a: RequestUser,
    @Query() q: QueryQuestionBankDto,
  ) {
    return this.service.listBanks(a, q);
  }
  @Get(':id') @ApiOperation({ summary: 'Get a question bank' }) getBank(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
  ) {
    return this.service.getBank(a, id);
  }
  @Patch(':id') @ApiOperation({ summary: 'Update a question bank' }) updateBank(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Body() d: UpdateQuestionBankDto,
  ) {
    return this.service.updateBank(a, id, d);
  }
  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a question bank' })
  publishBank(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.publishResource(a, 'bank', id);
  }
  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a question bank' })
  archiveBank(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.archiveResource(a, 'bank', id);
  }
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a question bank' })
  restoreBank(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.restoreResource(a, 'bank', id);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft question bank' })
  deleteBank(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.deleteResource(a, 'bank', id);
  }
}

@ApiTags('admin/questions')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/questions', version: '1' })
export class QuestionsController {
  constructor(private readonly service: QuestionBanksService) {}
  @Post('contexts')
  @ApiOperation({ summary: 'Create reusable question context' })
  createContext(
    @CurrentUser() a: RequestUser,
    @Body() d: CreateQuestionContextDto,
  ) {
    return this.service.createContext(a, d);
  }
  @Get('contexts')
  @ApiOperation({ summary: 'List reusable question contexts' })
  listContexts(@CurrentUser() a: RequestUser) {
    return this.service.listContexts(a);
  }
  @Patch('contexts/:contextId')
  @ApiOperation({ summary: 'Update reusable question context' })
  updateContext(
    @CurrentUser() a: RequestUser,
    @Param('contextId') id: string,
    @Body() d: UpdateQuestionContextDto,
  ) {
    return this.service.updateContext(a, id, d);
  }
  @Delete('contexts/:contextId')
  @ApiOperation({ summary: 'Delete unreferenced question context' })
  deleteContext(@CurrentUser() a: RequestUser, @Param('contextId') id: string) {
    return this.service.deleteContext(a, id);
  }
  @Post() @ApiOperation({ summary: 'Create a question' }) create(
    @CurrentUser() a: RequestUser,
    @Body() d: CreateQuestionDto,
  ) {
    return this.service.createQuestion(a, d);
  }
  @Get() @ApiOperation({ summary: 'List questions' }) list(
    @CurrentUser() a: RequestUser,
    @Query() q: QueryQuestionDto,
  ) {
    return this.service.listQuestions(a, q);
  }
  @Get(':id') @ApiOperation({ summary: 'Get a question' }) get(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
  ) {
    return this.service.getQuestion(a, id);
  }
  @Patch(':id') @ApiOperation({ summary: 'Update a question' }) update(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Body() d: UpdateQuestionDto,
  ) {
    return this.service.updateQuestion(a, id, d);
  }
  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit a question for review' })
  submit(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.submit(a, id);
  }
  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a reviewed question' })
  publish(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.publishQuestion(a, id);
  }
  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a question in review' })
  reject(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Body() d: RejectQuestionDto,
  ) {
    return this.service.rejectQuestion(a, id, d.reviewNote);
  }
  @Post(':id/archive') @ApiOperation({ summary: 'Archive a question' }) archive(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
  ) {
    return this.service.archiveQuestion(a, id);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft question' })
  delete(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.deleteQuestion(a, id);
  }
  @Post(':id/options')
  @ApiOperation({ summary: 'Add a question option' })
  addOption(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Body() d: CreateQuestionOptionDto,
  ) {
    return this.service.addOption(a, id, d);
  }
  @Patch(':id/options/:optionId')
  @ApiOperation({ summary: 'Update a question option' })
  updateOption(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body() d: UpdateQuestionOptionDto,
  ) {
    return this.service.updateOption(a, id, optionId, d);
  }
  @Delete(':id/options/:optionId')
  @ApiOperation({ summary: 'Delete a question option' })
  deleteOption(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Param('optionId') optionId: string,
  ) {
    return this.service.deleteOption(a, id, optionId);
  }
  @Post(':id/options/reorder')
  @ApiOperation({ summary: 'Reorder question options' })
  reorderOptions(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Body() d: ReorderQuestionOptionsDto,
  ) {
    return this.service.reorderOptions(a, id, d.optionIds);
  }
  @Post(':id/assets')
  @ApiOperation({
    summary: 'Attach a legacy-compatible asset to a question content block',
  })
  addAsset(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Body('assetId') assetId: string,
  ) {
    return this.service.addAsset(a, id, assetId);
  }
  @Delete(':id/assets/:assetId')
  @ApiOperation({ summary: 'Remove a legacy-compatible question asset block' })
  removeAsset(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
  ) {
    return this.service.removeAsset(a, id, assetId);
  }
  @Post(':id/assets/reorder')
  @ApiOperation({ summary: 'Reorder legacy-compatible question asset blocks' })
  reorderAssets(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Body() d: ReorderQuestionAssetsDto,
  ) {
    return this.service.reorderAssets(a, id, d.assetIds);
  }
  @Post(':id/video-link')
  @ApiOperation({ summary: 'Set a question video link' })
  setVideo(
    @CurrentUser() a: RequestUser,
    @Param('id') id: string,
    @Body() d: SetQuestionVideoLinkDto,
  ) {
    return this.service.setVideo(a, id, d);
  }
  @Delete(':id/video-link')
  @ApiOperation({ summary: 'Remove a question video link' })
  removeVideo(@CurrentUser() a: RequestUser, @Param('id') id: string) {
    return this.service.removeVideo(a, id);
  }
}

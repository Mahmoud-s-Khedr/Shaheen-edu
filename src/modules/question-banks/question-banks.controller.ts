import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { CreateQuestionBankDto, CreateQuestionDto, CreateQuestionOptionDto, CreateQuestionSourceDto, QueryQuestionBankDto, QueryQuestionDto, QueryQuestionSourceDto, RejectQuestionDto, ReorderQuestionAssetsDto, ReorderQuestionOptionsDto, SetQuestionVideoLinkDto, UpdateQuestionBankDto, UpdateQuestionDto, UpdateQuestionOptionDto, UpdateQuestionSourceDto } from './dto/question-banks.dto';
import { QuestionBanksService } from './question-banks.service';

@ApiTags('admin/question-banks') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/question-banks', version: '1' })
export class QuestionBanksController {
  constructor(private readonly service: QuestionBanksService) {}
  @Post('sources') createSource(@CurrentUser() a: RequestUser, @Body() d: CreateQuestionSourceDto) { return this.service.createSource(a, d); }
  @Get('sources') listSources(@CurrentUser() a: RequestUser, @Query() q: QueryQuestionSourceDto) { return this.service.listSources(a, q); }
  @Get('sources/:id') getSource(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.getSource(a, id); }
  @Patch('sources/:id') updateSource(@CurrentUser() a: RequestUser, @Param('id') id: string, @Body() d: UpdateQuestionSourceDto) { return this.service.updateSource(a, id, d); }
  @Post('sources/:id/publish') publishSource(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.publishResource(a, 'source', id); }
  @Post('sources/:id/archive') archiveSource(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.archiveResource(a, 'source', id); }
  @Post('sources/:id/restore') restoreSource(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.restoreResource(a, 'source', id); }
  @Delete('sources/:id') deleteSource(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.deleteResource(a, 'source', id); }
  @Post() createBank(@CurrentUser() a: RequestUser, @Body() d: CreateQuestionBankDto) { return this.service.createBank(a, d); }
  @Get() listBanks(@CurrentUser() a: RequestUser, @Query() q: QueryQuestionBankDto) { return this.service.listBanks(a, q); }
  @Get(':id') getBank(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.getBank(a, id); }
  @Patch(':id') updateBank(@CurrentUser() a: RequestUser, @Param('id') id: string, @Body() d: UpdateQuestionBankDto) { return this.service.updateBank(a, id, d); }
  @Post(':id/publish') publishBank(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.publishResource(a, 'bank', id); }
  @Post(':id/archive') archiveBank(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.archiveResource(a, 'bank', id); }
  @Post(':id/restore') restoreBank(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.restoreResource(a, 'bank', id); }
  @Delete(':id') deleteBank(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.deleteResource(a, 'bank', id); }
}

@ApiTags('admin/questions') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/questions', version: '1' })
export class QuestionsController {
  constructor(private readonly service: QuestionBanksService) {}
  @Post() create(@CurrentUser() a: RequestUser, @Body() d: CreateQuestionDto) { return this.service.createQuestion(a, d); }
  @Get() list(@CurrentUser() a: RequestUser, @Query() q: QueryQuestionDto) { return this.service.listQuestions(a, q); }
  @Get(':id') get(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.getQuestion(a, id); }
  @Patch(':id') update(@CurrentUser() a: RequestUser, @Param('id') id: string, @Body() d: UpdateQuestionDto) { return this.service.updateQuestion(a, id, d); }
  @Post(':id/submit') submit(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.submit(a, id); }
  @Post(':id/publish') publish(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.publishQuestion(a, id); }
  @Post(':id/reject') reject(@CurrentUser() a: RequestUser, @Param('id') id: string, @Body() d: RejectQuestionDto) { return this.service.rejectQuestion(a, id, d.reviewNote); }
  @Post(':id/archive') archive(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.archiveQuestion(a, id); }
  @Delete(':id') delete(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.deleteQuestion(a, id); }
  @Post(':id/options') addOption(@CurrentUser() a: RequestUser, @Param('id') id: string, @Body() d: CreateQuestionOptionDto) { return this.service.addOption(a, id, d); }
  @Patch(':id/options/:optionId') updateOption(@CurrentUser() a: RequestUser, @Param('id') id: string, @Param('optionId') optionId: string, @Body() d: UpdateQuestionOptionDto) { return this.service.updateOption(a, id, optionId, d); }
  @Delete(':id/options/:optionId') deleteOption(@CurrentUser() a: RequestUser, @Param('id') id: string, @Param('optionId') optionId: string) { return this.service.deleteOption(a, id, optionId); }
  @Post(':id/options/reorder') reorderOptions(@CurrentUser() a: RequestUser, @Param('id') id: string, @Body() d: ReorderQuestionOptionsDto) { return this.service.reorderOptions(a, id, d.optionIds); }
  @Post(':id/assets') addAsset(@CurrentUser() a: RequestUser, @Param('id') id: string, @Body('assetId') assetId: string) { return this.service.addAsset(a, id, assetId); }
  @Delete(':id/assets/:assetId') removeAsset(@CurrentUser() a: RequestUser, @Param('id') id: string, @Param('assetId') assetId: string) { return this.service.removeAsset(a, id, assetId); }
  @Post(':id/assets/reorder') reorderAssets(@CurrentUser() a: RequestUser, @Param('id') id: string, @Body() d: ReorderQuestionAssetsDto) { return this.service.reorderAssets(a, id, d.assetIds); }
  @Post(':id/video-link') setVideo(@CurrentUser() a: RequestUser, @Param('id') id: string, @Body() d: SetQuestionVideoLinkDto) { return this.service.setVideo(a, id, d); }
  @Delete(':id/video-link') removeVideo(@CurrentUser() a: RequestUser, @Param('id') id: string) { return this.service.removeVideo(a, id); }
}

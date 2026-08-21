import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { AcceptQuestionImportItemDto, CreateQuestionImportMediaDto, CreateQuestionImportDto, QueryQuestionImportDto, RejectQuestionImportItemDto, UpdateQuestionImportItemMediaAssignmentsDto, UpdateQuestionImportMediaDto, UpdateQuestionImportSourceTextDto } from './dto/question-import.dto';
import { QuestionImportService } from './question-import.service';

@ApiTags('admin/ai/question-imports') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/ai/question-imports', version: '1' })
export class QuestionImportController {
  constructor(private readonly service: QuestionImportService) {}
  @Post() @ApiOperation({ summary: 'Create and queue an AI question import' }) create(@CurrentUser() actor: RequestUser, @Body() dto: CreateQuestionImportDto) { return this.service.create(actor, dto); }
  @Get() @ApiOperation({ summary: 'List AI question imports' }) list(@CurrentUser() actor: RequestUser, @Query() query: QueryQuestionImportDto) { return this.service.list(actor, query); }
  @Get(':id') @ApiOperation({ summary: 'Get AI question import progress and diagnostics' }) get(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.service.get(actor, id); }
  @Get(':id/source-text') @ApiOperation({ summary: 'Get retained normalized source text for review' }) sourceText(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.service.sourceText(actor, id); }
  @Patch(':id/source-text') @ApiOperation({ summary: 'Correct source text and rerun AI boundary identification' }) updateSourceText(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: UpdateQuestionImportSourceTextDto) { return this.service.updateSourceText(actor, id, dto); }
  @Get(':id/items') @ApiOperation({ summary: 'List AI question import candidates' }) items(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Query() query: QueryQuestionImportDto) { return this.service.items(actor, id, query); }
  @Get(':id/media') @ApiOperation({ summary: 'List extracted PDF visual regions and protected previews' }) media(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.service.media(actor, id); }
  @Post(':id/media') @ApiOperation({ summary: 'Add and materialize a manual PDF visual region' }) createMedia(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: CreateQuestionImportMediaDto) { return this.service.createMedia(actor, id, dto); }
  @Patch(':id/media/:mediaKey') @ApiOperation({ summary: 'Review, reclassify, or resize an extracted visual region' }) updateMedia(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('mediaKey') mediaKey: string, @Body() dto: UpdateQuestionImportMediaDto) { return this.service.updateMedia(actor, id, mediaKey, dto); }
  @Post(':id/media/:mediaKey/retry') @ApiOperation({ summary: 'Retry a failed PDF visual crop' }) retryMedia(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('mediaKey') mediaKey: string) { return this.service.retryMedia(actor, id, mediaKey); }
  @Post(':id/retry') @ApiOperation({ summary: 'Retry failed import chunks' }) retry(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.service.retry(actor, id); }
  @Post(':id/chunks/:chunkId/retry') @ApiOperation({ summary: 'Retry one failed import chunk' }) retryChunk(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('chunkId') chunkId: string) { return this.service.retryChunk(actor, id, chunkId); }
  @Post(':id/pages/:pageNumber/retry') @ApiOperation({ summary: 'Retry one failed or review-required PDF transcription page' }) retryPage(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('pageNumber') pageNumber: string) { return this.service.retryPage(actor, id, Number(pageNumber)); }
  @Post(':id/children/:childId/retry') @ApiOperation({ summary: 'Retry one failed page-range import' }) retryChild(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('childId') childId: string) { return this.service.retryChild(actor, id, childId); }
  @Post(':id/items/:itemId/retry') @ApiOperation({ summary: 'Retry one failed import item' }) retryItem(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('itemId') itemId: string) { return this.service.retry(actor, id, itemId); }
  @Patch(':id/items/:itemId/media') @ApiOperation({ summary: 'Approve, reject, move, or reorder visual ownership assignments' }) updateItemMedia(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateQuestionImportItemMediaAssignmentsDto) { return this.service.updateItemMedia(actor, id, itemId, dto); }
  @Post(':id/items/:itemId/accept') @ApiOperation({ summary: 'Accept a corrected review candidate and create one draft question' }) acceptItem(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: AcceptQuestionImportItemDto) { return this.service.acceptItem(actor, id, itemId, dto); }
  @Post(':id/items/:itemId/reject') @ApiOperation({ summary: 'Reject an unresolved review candidate' }) rejectItem(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: RejectQuestionImportItemDto) { return this.service.rejectItem(actor, id, itemId, dto); }
}

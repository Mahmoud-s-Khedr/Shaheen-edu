import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { CreateNotebookPageDto, CreateQuestionHighlightDto, NotebookPageDto, QuestionHighlightDto, UpdateNotebookPageDto } from './dto/student-workspace.dto';
import { StudentWorkspaceService } from './student-workspace.service';

@ApiTags('student/questions') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.STUDENT)
@Controller({ path: 'student/questions', version: '1' })
export class StudentQuestionHighlightsController {
  constructor(private readonly workspace: StudentWorkspaceService) {}
  @Get(':questionId/highlights') @ApiOperation({ summary: 'List the student’s private highlights for an accessible question' }) @ApiOkResponse({ type: QuestionHighlightDto, isArray: true }) list(@CurrentUser() user: RequestUser, @Param('questionId') questionId: string) { return this.workspace.listHighlights(user.id, questionId); }
  @Post(':questionId/highlights') @ApiOperation({ summary: 'Create a private question-text highlight' }) @ApiCreatedResponse({ type: QuestionHighlightDto }) create(@CurrentUser() user: RequestUser, @Param('questionId') questionId: string, @Body() dto: CreateQuestionHighlightDto) { return this.workspace.createHighlight(user.id, questionId, dto); }
  @Delete(':questionId/highlights/:highlightId') @ApiOperation({ summary: 'Delete the student’s own question highlight' }) remove(@CurrentUser() user: RequestUser, @Param('questionId') questionId: string, @Param('highlightId') highlightId: string) { return this.workspace.deleteHighlight(user.id, questionId, highlightId); }
}

@ApiTags('student/notebook') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.STUDENT)
@Controller({ path: 'student/notebook/pages', version: '1' })
export class StudentNotebookController {
  constructor(private readonly workspace: StudentWorkspaceService) {}
  @Get() @ApiOperation({ summary: 'List the student’s global notebook pages' }) @ApiOkResponse({ type: NotebookPageDto, isArray: true }) list(@CurrentUser() user: RequestUser) { return this.workspace.listPages(user.id); }
  @Post() @ApiOperation({ summary: 'Create a global notebook page' }) @ApiCreatedResponse({ type: NotebookPageDto }) create(@CurrentUser() user: RequestUser, @Body() dto: CreateNotebookPageDto) { return this.workspace.createPage(user.id, dto); }
  @Get(':pageId') @ApiOperation({ summary: 'Get the student’s notebook page' }) get(@CurrentUser() user: RequestUser, @Param('pageId') pageId: string) { return this.workspace.getPage(user.id, pageId); }
  @Patch(':pageId') @ApiOperation({ summary: 'Update the student’s notebook page' }) update(@CurrentUser() user: RequestUser, @Param('pageId') pageId: string, @Body() dto: UpdateNotebookPageDto) { return this.workspace.updatePage(user.id, pageId, dto); }
  @Delete(':pageId') @ApiOperation({ summary: 'Delete the student’s notebook page' }) remove(@CurrentUser() user: RequestUser, @Param('pageId') pageId: string) { return this.workspace.deletePage(user.id, pageId); }
}

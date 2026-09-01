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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/types/roles.enum';
import { ChaptersService } from './chapters.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';
import { QueryChapterDto } from './dto/query-chapter.dto';
import { ReorderChapterDto } from './dto/reorder-chapter.dto';
import { MoveChapterDto } from './dto/move-chapter.dto';
import { UpdateAccessTypeDto } from '../../common/dto/update-access-type.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import {
  AdminChapterReadDto,
  ChapterSummaryDto,
  PaginatedAdminChapterReadResponseDto,
} from '../../common/dto/api-response.dto';

@ApiTags('admin/chapters')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/chapters', version: '1' })
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a chapter' })
  @ApiCreatedResponse({ type: ChapterSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateChapterDto) {
    return this.chaptersService.create(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List chapters',
    description:
      'Returns chapters ordered by sortOrder using offset pagination.',
  })
  @ApiOkResponse({ type: PaginatedAdminChapterReadResponseDto })
  @ApiStandardErrors(400, 401, 403)
  list(@CurrentUser() actor: RequestUser, @Query() query: QueryChapterDto) {
    return this.chaptersService.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a chapter by ID' })
  @ApiOkResponse({ type: AdminChapterReadDto })
  @ApiStandardErrors(401, 403, 404)
  getById(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.chaptersService.getById(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a chapter' })
  @ApiOkResponse({ type: ChapterSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateChapterDto,
  ) {
    return this.chaptersService.update(actor, id, dto);
  }

  @Patch(':id/access')
  @ApiOperation({ summary: 'Set the chapter access type' })
  updateAccess(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccessTypeDto,
  ) {
    return this.chaptersService.updateAccess(actor, id, dto.accessType);
  }

  @Post('reorder')
  @ApiOperation({ summary: 'Atomically reorder chapters within a course' })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  reorder(@CurrentUser() actor: RequestUser, @Body() dto: ReorderChapterDto) {
    return this.chaptersService.reorder(actor, dto);
  }

  @Post(':id/move')
  @ApiOperation({ summary: 'Move a chapter to a different course' })
  @ApiOkResponse({ type: ChapterSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  move(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: MoveChapterDto,
  ) {
    return this.chaptersService.move(actor, id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a chapter' })
  @ApiOkResponse({ type: ChapterSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  publish(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.chaptersService.publish(actor, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a chapter' })
  @ApiOkResponse({ type: ChapterSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  archive(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.chaptersService.archive(actor, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived chapter' })
  @ApiOkResponse({ type: ChapterSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  restore(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.chaptersService.restore(actor, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft chapter' })
  @ApiStandardErrors(401, 403, 404, 409)
  delete(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.chaptersService.delete(actor, id);
  }
}

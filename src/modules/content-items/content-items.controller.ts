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
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { VersionOnlyDto } from '../../common/dto/version-only.dto';
import {
  ContentItemSummaryDto,
  PaginatedContentItemResponseDto,
} from '../../common/dto/api-response.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { Role } from '../../common/types/roles.enum';
import { CreateContentItemDto } from './dto/create-content-item.dto';
import { MoveContentItemDto } from './dto/move-content-item.dto';
import { QueryContentItemDto } from './dto/query-content-item.dto';
import { ReorderContentItemDto } from './dto/reorder-content-item.dto';
import { UpdateContentItemDto } from './dto/update-content-item.dto';
import { ContentItemsService } from './content-items.service';

@ApiTags('admin/content-items')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/content-items', version: '1' })
export class ContentItemsController {
  constructor(private readonly contentItemsService: ContentItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a content item at one hierarchy target' })
  @ApiCreatedResponse({ type: ContentItemSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateContentItemDto) {
    return this.contentItemsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List content items' })
  @ApiOkResponse({ type: PaginatedContentItemResponseDto })
  list(@CurrentUser() actor: RequestUser, @Query() query: QueryContentItemDto) {
    return this.contentItemsService.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a content item by ID' })
  @ApiOkResponse({ type: ContentItemSummaryDto })
  getById(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.contentItemsService.getById(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a content item' })
  @ApiOkResponse({ type: ContentItemSummaryDto })
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateContentItemDto,
  ) {
    return this.contentItemsService.update(actor, id, dto);
  }

  @Post('reorder')
  @ApiOperation({ summary: 'Atomically reorder all content at one target' })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  reorder(
    @CurrentUser() actor: RequestUser,
    @Body() dto: ReorderContentItemDto,
  ) {
    return this.contentItemsService.reorder(actor, dto);
  }

  @Post(':id/move')
  @ApiOperation({ summary: 'Move a content item to a hierarchy target' })
  @ApiOkResponse({ type: ContentItemSummaryDto })
  move(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: MoveContentItemDto,
  ) {
    return this.contentItemsService.move(actor, id, dto);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a content item' })
  archive(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: VersionOnlyDto,
  ) {
    return this.contentItemsService.archive(actor, id, dto);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived content item as draft' })
  restore(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: VersionOnlyDto,
  ) {
    return this.contentItemsService.restore(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft content item' })
  delete(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: VersionOnlyDto,
  ) {
    return this.contentItemsService.delete(actor, id, dto);
  }
}

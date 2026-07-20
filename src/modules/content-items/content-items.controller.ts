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
import { UpdateAccessTypeDto } from '../../common/dto/update-access-type.dto';
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

  @Patch(':id/access')
  @ApiOperation({ summary: 'Set the content item access type' })
  updateAccess(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: UpdateAccessTypeDto) {
    return this.contentItemsService.updateAccess(actor, id, dto.accessType);
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

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a content item' })
  publish(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.contentItemsService.publish(actor, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a content item' })
  archive(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.contentItemsService.archive(actor, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived content item as draft' })
  restore(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.contentItemsService.restore(actor, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft content item' })
  delete(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.contentItemsService.delete(actor, id);
  }

  @Post(':id/primary-asset')
  setPrimaryAsset(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body('assetId') assetId: string) {
    return this.contentItemsService.setPrimaryAsset(actor, id, assetId);
  }

  @Post(':id/attachments')
  addAttachment(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body('assetId') assetId: string) {
    return this.contentItemsService.addAttachment(actor, id, assetId);
  }

  @Post(':id/attachments/reorder')
  reorderAttachments(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body('assetIds') assetIds: string[]) {
    return this.contentItemsService.reorderAttachments(actor, id, assetIds);
  }

  @Delete(':id/attachments/:assetId')
  removeAttachment(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('assetId') assetId: string) {
    return this.contentItemsService.removeAttachment(actor, id, assetId);
  }
}

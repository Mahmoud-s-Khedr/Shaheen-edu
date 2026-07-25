import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AssetKind, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { AssetsService } from './assets.service';

@ApiTags('admin/assets') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/assets', version: '1' })
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}
  @Post('upload') @ApiConsumes('multipart/form-data') @ApiOperation({ summary: 'Upload a file asset' })
  async upload(@CurrentUser() actor: RequestUser, @Req() req: any, @Query('kind') kind: AssetKind) { if (!Object.values(AssetKind).includes(kind)) throw new BadRequestException('Unsupported asset kind'); const part = await req.file(); if (!part) throw new BadRequestException('A file is required'); return this.assets.upload(actor, kind, part); }
  @Get() @ApiOperation({ summary: 'List assets' }) list(@CurrentUser() actor: RequestUser) { return this.assets.list(actor); }
  @Get(':id') @ApiOperation({ summary: 'Get an asset by ID' }) get(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.assets.get(actor, id); }
  @Post(':id/archive') @ApiOperation({ summary: 'Archive an asset' }) archive(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.assets.archive(actor, id); }
  @Delete(':id') @ApiOperation({ summary: 'Delete an unused draft asset' }) delete(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.assets.delete(actor, id); }
  @Post('covers/:resource/:id') @ApiOperation({ summary: 'Set a hierarchy record cover image' }) setCover(@CurrentUser() actor: RequestUser, @Param('resource') resource: string, @Param('id') id: string, @Body('assetId') assetId: string) { return this.assets.setCover(actor, resource, id, assetId); }
}

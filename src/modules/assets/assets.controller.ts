import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
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
  @Post('upload') @ApiConsumes('multipart/form-data')
  async upload(@CurrentUser() actor: RequestUser, @Req() req: any, @Query('kind') kind: AssetKind) { const part = await req.file(); if (!part) throw new Error('A file is required'); return this.assets.upload(actor, kind, part); }
  @Get() list(@CurrentUser() actor: RequestUser) { return this.assets.list(actor); }
  @Get(':id') get(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.assets.get(actor, id); }
  @Post(':id/archive') archive(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.assets.archive(actor, id); }
  @Post('covers/:resource/:id') setCover(@CurrentUser() actor: RequestUser, @Param('resource') resource: string, @Param('id') id: string, @Body('assetId') assetId: string) { return this.assets.setCover(actor, resource, id, assetId); }
}

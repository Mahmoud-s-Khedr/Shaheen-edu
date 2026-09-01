import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AssetKind, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { AssetsService } from './assets.service';

@ApiTags('admin/assets')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/assets', version: '1' })
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}
  // Keep the legacy upload URL and multipart input as the first step of the
  // direct-upload flow. The file is only used to authorize its name and type;
  // the client sends its bytes to Bunny using the returned signed URL.
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Authorize a direct Bunny file upload' })
  async authorize(
    @CurrentUser() actor: RequestUser,
    @Query('kind') kind: AssetKind,
    @Req() req: any,
  ) {
    if (!Object.values(AssetKind).includes(kind))
      throw new BadRequestException('Unsupported asset kind');
    const part = await req.file();
    if (!part) throw new BadRequestException('A file is required');
    try {
      return await this.assets.authorizeUpload(actor, kind, {
        filename: part.filename,
        mimeType: part.mimetype,
      });
    } finally {
      // Fastify multipart requires the stream to be consumed even though this
      // step no longer persists the file itself.
      for await (const _chunk of part.file) {
        /* drain */
      }
    }
  }
  @Post(':id/complete')
  @ApiOperation({
    summary: 'Verify a direct Bunny upload and mark its asset ready',
  })
  complete(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.assets.completeUpload(actor, id);
  }
  @Get() @ApiOperation({ summary: 'List assets' }) list(
    @CurrentUser() actor: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.assets.list(actor, query);
  }
  @Get(':id') @ApiOperation({ summary: 'Get an asset by ID' }) get(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
  ) {
    return this.assets.get(actor, id);
  }
  @Get(':id/access')
  @ApiOperation({ summary: 'Get a short-lived preview URL for an admin asset' })
  access(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.assets.adminAccess(actor, id);
  }
  @Post(':id/archive') @ApiOperation({ summary: 'Archive an asset' }) archive(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
  ) {
    return this.assets.archive(actor, id);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an unused draft asset' })
  delete(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.assets.delete(actor, id);
  }
  @Post('covers/:resource/:id')
  @ApiOperation({ summary: 'Set a hierarchy record cover image' })
  setCover(
    @CurrentUser() actor: RequestUser,
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body('assetId') assetId: string,
  ) {
    return this.assets.setCover(actor, resource, id, assetId);
  }
  @Delete('covers/:resource/:id')
  @ApiOperation({ summary: 'Remove a hierarchy record cover image' })
  removeCover(
    @CurrentUser() actor: RequestUser,
    @Param('resource') resource: string,
    @Param('id') id: string,
  ) {
    return this.assets.removeCover(actor, resource, id);
  }
}

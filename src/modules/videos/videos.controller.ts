import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { VideosService } from './videos.service';

@ApiTags('admin/videos')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/video-assets', version: '1' })
export class VideosController {
  constructor(private readonly videos: VideosService) {}
  @Post() @ApiOperation({ summary: 'Create a video asset' }) create(
    @CurrentUser() actor: RequestUser,
    @Body() body: { title: string; filename?: string },
  ) {
    return this.videos.create(actor, body.title, body.filename);
  }
  @Get(':id') @ApiOperation({ summary: 'Get a video asset by ID' }) get(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
  ) {
    return this.videos.get(actor, id);
  }
  @Post(':id/upload-authorization')
  @ApiOperation({ summary: 'Create a short-lived direct-upload authorization' })
  authorization(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.videos.authorization(actor, id);
  }
  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed video asset' })
  retry(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.videos.retry(actor, id);
  }
  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a video asset' })
  archive(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.videos.archive(actor, id);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an unreferenced Bunny video asset' })
  delete(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.videos.delete(actor, id);
  }
}

@ApiTags('integrations/bunny-stream')
@Public()
@Controller({ path: 'integrations/bunny-stream', version: '1' })
export class BunnyStreamWebhookController {
  constructor(private readonly videos: VideosService) {}
  @Post('webhook')
  @ApiOperation({ summary: 'Receive a Bunny Stream processing webhook' })
  async webhook(
    @Req() req: any,
    @Headers('x-bunnystream-signature') signature: string,
    @Headers('x-bunnystream-signature-version') version: string,
    @Headers('x-bunnystream-signature-algorithm') algorithm: string,
  ) {
    const raw = (req.rawBody as Buffer | undefined)?.toString('utf8');
    if (!raw || !this.videos.verifyWebhook(raw, signature, version, algorithm))
      throw new UnauthorizedException('Invalid Bunny Stream signature');
    try {
      return await this.videos.webhook(JSON.parse(raw), raw);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new BadRequestException('Invalid Bunny Stream payload');
      throw error;
    }
  }
}

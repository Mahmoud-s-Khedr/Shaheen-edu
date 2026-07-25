import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { AssetsService } from '../assets/assets.service';
import { VideosService } from '../videos/videos.service';
import { ContentAccessPolicyService } from './content-access-policy.service';

abstract class ContentAssetAccessBase {
  constructor(protected readonly policy: ContentAccessPolicyService, protected readonly assets: AssetsService, protected readonly videos: VideosService) {}
  protected async authorizeAsset(contentItemId: string, assetId: string, studentId?: string) { await this.policy.assertContentItemAccess(contentItemId, studentId); await this.policy.assertAssetAttached(contentItemId, assetId); const asset = await this.assets.getReady(assetId); return asset.kind === 'VIDEO' ? this.videos.playback(assetId) : this.assets.protectedAccess(asset); }
}

@ApiTags('catalog/content-assets') @Public() @Controller({ path: 'catalog/content-items', version: '1' })
export class ContentAssetAccessController extends ContentAssetAccessBase {
  // An explicit constructor is required so Nest emits DI metadata for this concrete
  // class; without it the inherited base deps are never injected (policy is undefined).
  constructor(policy: ContentAccessPolicyService, assets: AssetsService, videos: VideosService) { super(policy, assets, videos); }
  @Get(':contentItemId/assets/:assetId/access') @ApiOperation({ summary: 'Get a protected asset access URL for public content' }) asset(@Param('contentItemId') contentItemId: string, @Param('assetId') assetId: string) { return super.authorizeAsset(contentItemId, assetId); }
}

@ApiTags('student/content-assets') @ApiBearerAuth() @UseGuards(RolesGuard) @Roles(Role.STUDENT) @Controller({ path: 'student/content-items', version: '1' })
export class StudentContentAssetAccessController extends ContentAssetAccessBase {
  constructor(policy: ContentAccessPolicyService, assets: AssetsService, videos: VideosService) { super(policy, assets, videos); }
  @Get(':contentItemId/assets/:assetId/access') @ApiOperation({ summary: 'Get a protected asset access URL for an entitled student' }) asset(@CurrentUser() user: RequestUser, @Param('contentItemId') contentItemId: string, @Param('assetId') assetId: string) { return super.authorizeAsset(contentItemId, assetId, user.id); }
}

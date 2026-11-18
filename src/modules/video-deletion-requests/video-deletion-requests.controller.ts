import {
  VideoDeletionRequestPageDto,
  VideoDeletionRequestResponseDto,
} from './video-deletion-requests.dto';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { VideoDeletionRequestsService } from './video-deletion-requests.service';

export class CreateVideoDeletionRequestDto {
  @ApiProperty() @IsString() @MinLength(1) assetId!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) reason!: string;
}
export class VideoDeletionReasonDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) reason!: string;
}
export class ApproveVideoDeletionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
@ApiTags('admin/video-deletion-requests')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.TEACHER, Role.SUPER_ADMIN)
@ApiStandardErrors(400, 401, 403, 404, 409)
@Controller({ path: 'admin/video-deletion-requests', version: '1' })
export class VideoDeletionRequestsController {
  constructor(private readonly requests: VideoDeletionRequestsService) {}
  @Post()
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Request permanent deletion of a scoped video' })
  @ApiCreatedResponse({ type: VideoDeletionRequestResponseDto })
  create(
    @CurrentUser() actor: RequestUser,
    @Body() dto: CreateVideoDeletionRequestDto,
  ) {
    return this.requests.create(actor, dto.assetId, dto.reason);
  }
  @Get()
  @ApiOperation({
    summary:
      'List own teacher deletion requests or all requests as super admin',
  })
  @ApiOkResponse({ type: VideoDeletionRequestPageDto })
  list(@CurrentUser() actor: RequestUser, @Query() query: PaginationQueryDto) {
    return this.requests.list(actor, query);
  }
  @Get(':id')
  @ApiOperation({
    summary:
      'Get deletion request and current global references for super admin review',
  })
  @ApiOkResponse({ type: VideoDeletionRequestResponseDto })
  get(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.requests.get(actor, id);
  }
  @Post(':id/approve')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Approve and execute permanent global video deletion',
  })
  @ApiCreatedResponse({ type: VideoDeletionRequestResponseDto })
  approve(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: ApproveVideoDeletionDto,
  ) {
    return this.requests.approve(actor, id, dto.reason);
  }
  @Post(':id/reject')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reject deletion without modifying the video' })
  @ApiCreatedResponse({ type: VideoDeletionRequestResponseDto })
  reject(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: VideoDeletionReasonDto,
  ) {
    return this.requests.reject(actor, id, dto.reason);
  }
  @Post(':id/retry')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Retry failed or interrupted approved deletion' })
  @ApiCreatedResponse({ type: VideoDeletionRequestResponseDto })
  retry(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.requests.retry(actor, id);
  }
}

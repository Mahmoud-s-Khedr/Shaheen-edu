import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiParam,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  QueryVideoFeedbackDto,
  UpsertVideoFeedbackDto,
} from './dto/video-feedback.dto';
import { VideoFeedbackService } from './video-feedback.service';

@ApiTags('student/video-feedback')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/video-assets', version: '1' })
export class StudentVideoFeedbackController {
  constructor(private readonly feedback: VideoFeedbackService) {}

  @Post(':videoAssetId/feedback')
  @ApiOperation({
    summary: 'Create or update personal feedback for an accessible ready video',
  })
  @ApiCreatedResponse()
  upsert(
    @CurrentUser() user: RequestUser,
    @Param('videoAssetId') videoAssetId: string,
    @Body() dto: UpsertVideoFeedbackDto,
  ) {
    return this.feedback.upsert(user.id, videoAssetId, dto);
  }
}

@ApiTags('admin/video-feedback')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/video-feedback', version: '1' })
export class AdminVideoFeedbackController {
  constructor(private readonly feedback: VideoFeedbackService) {}

  @Get()
  @ApiOperation({ summary: 'List student video feedback' })
  @ApiOkResponse()
  @ApiStandardErrors(400, 401, 403)
  list(
    @CurrentUser() actor: RequestUser,
    @Query() query: QueryVideoFeedbackDto,
  ) {
    return this.feedback.list(actor, query);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Permanently delete student video feedback' })
  @ApiParam({ name: 'id', description: 'Video feedback ID.' })
  @ApiOkResponse({ schema: { example: { id: 'feedback_123', deleted: true } } })
  @ApiStandardErrors(401, 403, 404)
  remove(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.feedback.remove(actor, id);
  }
}

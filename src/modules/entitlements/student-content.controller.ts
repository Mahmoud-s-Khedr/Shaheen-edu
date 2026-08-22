import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ContentAccessPolicyService } from './content-access-policy.service';
import { PrismaService } from '../../database/prisma.service';
import { DeliveryContentQueryDto } from './dto/delivery-content-query.dto';

@ApiTags('student/content')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/content-items', version: '1' })
export class StudentContentController {
  constructor(
    private readonly policy: ContentAccessPolicyService,
    private readonly prisma: PrismaService,
  ) {}
  @Get(':id')
  @ApiOperation({ summary: 'Get a content item the student can access' })
  async get(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query() query: DeliveryContentQueryDto,
  ) {
    const item = await this.policy.assertContentItemAccess(id, user.id);
    const [progress, studyState] = await this.prisma.$transaction([
      this.prisma.studentContentProgress.findUnique({
        where: {
          studentUserId_contentItemId: {
            studentUserId: user.id,
            contentItemId: id,
          },
        },
      }),
      this.prisma.studentContentStudyState.findUnique({
        where: {
          studentUserId_contentItemId: {
            studentUserId: user.id,
            contentItemId: id,
          },
        },
      }),
    ]);
    const delivery = {
      ...this.policy.toDeliveryDto(item),
      progress: {
        completed: Boolean(progress),
        completedAt: progress?.completedAt ?? null,
      },
      studyState: {
        lastOpenedAt: studyState?.lastOpenedAt ?? null,
        playbackPositionSeconds: studyState?.playbackPositionSeconds ?? null,
      },
    };
    if (query.includeVideoOutline === 'true' && item.type === 'VIDEO') {
      const topics = await this.prisma.videoOutlineTopic.findMany({
        where: { contentItemId: id },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: {
          concepts: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        },
      });
      return {
        ...delivery,
        videoOutline: topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          startSeconds: topic.startSeconds,
          endSeconds: topic.endSeconds,
          sortOrder: topic.sortOrder,
          concepts: topic.concepts.map((concept) => ({
            id: concept.id,
            title: concept.title,
            sortOrder: concept.sortOrder,
          })),
        })),
      };
    }
    return delivery;
  }
}

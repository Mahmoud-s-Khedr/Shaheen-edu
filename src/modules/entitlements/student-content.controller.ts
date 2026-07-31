import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ContentAccessPolicyService } from './content-access-policy.service';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('student/content')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/content-items', version: '1' })
export class StudentContentController {
  constructor(private readonly policy: ContentAccessPolicyService, private readonly prisma: PrismaService) {}
  @Get(':id') @ApiOperation({ summary: 'Get a content item the student can access' }) async get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const item = await this.policy.assertContentItemAccess(id, user.id);
    const progress = await this.prisma.studentContentProgress.findUnique({ where: { studentUserId_contentItemId: { studentUserId: user.id, contentItemId: id } } });
    return { ...this.policy.toDeliveryDto(item), progress: { completed: Boolean(progress), completedAt: progress?.completedAt ?? null } };
  }
}

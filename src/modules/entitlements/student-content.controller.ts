import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ContentAccessPolicyService } from './content-access-policy.service';

@ApiTags('student/content')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/content-items', version: '1' })
export class StudentContentController {
  constructor(private readonly policy: ContentAccessPolicyService) {}
  @Get(':id') @ApiOperation({ summary: 'Get a content item the student can access' }) async get(@CurrentUser() user: RequestUser, @Param('id') id: string) { return this.policy.toDeliveryDto(await this.policy.assertContentItemAccess(id, user.id)); }
}

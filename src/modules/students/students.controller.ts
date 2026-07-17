import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/types/roles.enum';
import { StudentsService } from './students.service';
import { UpdateStudentDto } from './dto/update-student.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';

@ApiTags('students')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'students', version: '1' })
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.studentsService.getOwnProfile(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdateStudentDto) {
    return this.studentsService.updateOwnProfile(user.id, dto);
  }
}

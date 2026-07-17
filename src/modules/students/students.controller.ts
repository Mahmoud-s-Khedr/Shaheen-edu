import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/types/roles.enum';
import { StudentsService } from './students.service';
import { UpdateStudentDto } from './dto/update-student.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import { StudentProfileDto } from '../../common/dto/api-response.dto';

@ApiTags('students')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'students', version: '1' })
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated student profile' })
  @ApiOkResponse({ type: StudentProfileDto })
  @ApiStandardErrors(401, 403, 404)
  me(@CurrentUser() user: RequestUser) {
    return this.studentsService.getOwnProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated student profile' })
  @ApiOkResponse({ type: StudentProfileDto })
  @ApiStandardErrors(400, 401, 403, 404)
  updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdateStudentDto) {
    return this.studentsService.updateOwnProfile(user.id, dto);
  }
}

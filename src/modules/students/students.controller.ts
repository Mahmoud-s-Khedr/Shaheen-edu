import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import {
  AdminStudentDetailDto,
  AdminStudentSummaryDto,
  PaginatedAdminStudentResponseDto,
  PasswordResetResponseDto,
} from '../../common/dto/api-response.dto';
import { QueryAdminStudentsDto } from './dto/query-admin-students.dto';
import { DeleteStudentDto } from './dto/delete-student.dto';

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

@ApiTags('admin/students')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/students', version: '1' })
export class AdminStudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'List student accounts' })
  @ApiOkResponse({ type: PaginatedAdminStudentResponseDto })
  @ApiStandardErrors(400, 401, 403)
  list(
    @CurrentUser() actor: RequestUser,
    @Query() query: QueryAdminStudentsDto,
  ) {
    return this.studentsService.listForAdmin(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a student account' })
  @ApiOkResponse({ type: AdminStudentDetailDto })
  @ApiStandardErrors(401, 403, 404)
  get(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.studentsService.getForAdmin(actor, id);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a student and revoke sessions' })
  @ApiOkResponse({ type: AdminStudentSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  suspend(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.studentsService.suspend(actor, id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a suspended student' })
  @ApiOkResponse({ type: AdminStudentSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  reactivate(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.studentsService.reactivate(actor, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a student account' })
  @ApiOkResponse({ schema: { example: { id: 'student-id', deleted: true } } })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  remove(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: DeleteStudentDto,
  ) {
    return this.studentsService.softDelete(actor, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset a student password' })
  @ApiOkResponse({ type: PasswordResetResponseDto })
  @ApiStandardErrors(401, 403, 404, 409)
  resetPassword(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.studentsService.resetPassword(actor, id);
  }
}

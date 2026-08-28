import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  CreateSubjectConstantDto,
  SubjectConstantDto,
  SubjectConstantsResponseDto,
  UpdateSubjectConstantDto,
} from './dto/subject-constants.dto';
import { SubjectConstantsService } from './subject-constants.service';

@ApiTags('subjects/constants')
@Public()
@Controller({ path: 'subjects', version: '1' })
export class PublicSubjectConstantsController {
  constructor(private readonly constants: SubjectConstantsService) {}
  @Get(':subjectId/constants')
  @ApiOperation({ summary: 'List public calculator constants for a subject' })
  @ApiOkResponse({ type: SubjectConstantsResponseDto })
  list(@Param('subjectId') subjectId: string) {
    return this.constants.publicList(subjectId);
  }
}

@ApiTags('admin/subjects/constants')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/subjects/:subjectId/constants', version: '1' })
export class AdminSubjectConstantsController {
  constructor(private readonly constants: SubjectConstantsService) {}
  @Get()
  @ApiOperation({ summary: 'List constants for a subject' })
  @ApiOkResponse({ type: SubjectConstantsResponseDto })
  list(
    @CurrentUser() actor: RequestUser,
    @Param('subjectId') subjectId: string,
  ) {
    return this.constants.list(actor, subjectId);
  }
  @Post()
  @ApiOperation({ summary: 'Create a subject constant' })
  @ApiCreatedResponse({ type: SubjectConstantDto })
  create(
    @CurrentUser() actor: RequestUser,
    @Param('subjectId') subjectId: string,
    @Body() dto: CreateSubjectConstantDto,
  ) {
    return this.constants.create(actor, subjectId, dto);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get a subject constant' })
  @ApiOkResponse({ type: SubjectConstantDto })
  get(
    @CurrentUser() actor: RequestUser,
    @Param('subjectId') subjectId: string,
    @Param('id') id: string,
  ) {
    return this.constants.get(actor, subjectId, id);
  }
  @Patch(':id')
  @ApiOperation({ summary: 'Update a subject constant' })
  @ApiOkResponse({ type: SubjectConstantDto })
  update(
    @CurrentUser() actor: RequestUser,
    @Param('subjectId') subjectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSubjectConstantDto,
  ) {
    return this.constants.update(actor, subjectId, id, dto);
  }
  @Delete(':id') @ApiOperation({ summary: 'Delete a subject constant' }) remove(
    @CurrentUser() actor: RequestUser,
    @Param('subjectId') subjectId: string,
    @Param('id') id: string,
  ) {
    return this.constants.remove(actor, subjectId, id);
  }
}

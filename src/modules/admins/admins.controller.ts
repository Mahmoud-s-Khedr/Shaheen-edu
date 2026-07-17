import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminsService } from './admins.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import {
  AdminSummaryDto,
  PaginatedAdminResponseDto,
} from '../../common/dto/api-response.dto';

@ApiTags('admin/admins')
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Controller({ path: 'admin/admins', version: '1' })
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an administrator' })
  @ApiCreatedResponse({ type: AdminSummaryDto })
  @ApiStandardErrors(400, 401, 403, 409)
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateAdminDto) {
    return this.adminsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List administrators',
    description: 'Returns administrators newest first using offset pagination.',
  })
  @ApiOkResponse({ type: PaginatedAdminResponseDto })
  @ApiStandardErrors(400, 401, 403)
  list(
    @CurrentUser() actor: RequestUser,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.adminsService.list(actor, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an administrator by ID' })
  @ApiOkResponse({ type: AdminSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  getById(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.adminsService.getById(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an administrator email' })
  @ApiOkResponse({ type: AdminSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.adminsService.update(actor, id, dto);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend an administrator and revoke sessions' })
  @ApiCreatedResponse({ type: AdminSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  suspend(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.adminsService.suspend(actor, id);
  }

  @Post(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate an administrator' })
  @ApiCreatedResponse({ type: AdminSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  reactivate(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.adminsService.reactivate(actor, id);
  }
}

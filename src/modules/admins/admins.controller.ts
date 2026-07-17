import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminsService } from './admins.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';

@ApiTags('admin/admins')
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Controller({ path: 'admin/admins', version: '1' })
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Post()
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateAdminDto) {
    return this.adminsService.create(actor, dto);
  }

  @Get()
  list(@CurrentUser() actor: RequestUser) {
    return this.adminsService.list(actor);
  }

  @Get(':id')
  getById(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.adminsService.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.adminsService.update(actor, id, dto);
  }

  @Post(':id/suspend')
  suspend(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.adminsService.suspend(actor, id);
  }

  @Post(':id/reactivate')
  reactivate(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.adminsService.reactivate(actor, id);
  }
}

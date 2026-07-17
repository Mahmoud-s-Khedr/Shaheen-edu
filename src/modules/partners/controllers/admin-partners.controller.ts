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
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Role } from '../../../common/types/roles.enum';
import { PartnersService } from '../partners.service';
import { CreatePartnerDto } from '../dto/create-partner.dto';
import { UpdatePartnerDto } from '../dto/update-partner.dto';
import type { RequestUser } from '../../../common/types/request-with-user.types';

@ApiTags('admin/partners')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
@Controller({ path: 'admin/partners', version: '1' })
export class AdminPartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Post()
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreatePartnerDto) {
    return this.partnersService.create(actor, dto);
  }

  @Get()
  list() {
    return this.partnersService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.partnersService.getById(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.partnersService.update(actor, id, dto);
  }

  @Post(':id/suspend')
  suspend(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.partnersService.suspend(actor, id);
  }

  @Post(':id/reactivate')
  reactivate(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.partnersService.reactivate(actor, id);
  }
}

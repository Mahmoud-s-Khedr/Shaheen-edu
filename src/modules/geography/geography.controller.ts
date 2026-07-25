import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { GeographyService } from './geography.service';
import { CreateGeographyNameDto } from './geography.dto';

@ApiTags('admin/geography')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/geography', version: '1' })
export class GeographyController {
  constructor(private readonly service: GeographyService) {}
  @Get('governorates') @ApiOperation({ summary: 'List managed governorates and centers' }) list(@CurrentUser() _actor: RequestUser) { return this.service.listGovernorates(); }
  @Post('governorates') @ApiOperation({ summary: 'Create a governorate' }) governorate(@CurrentUser() _actor: RequestUser, @Body() dto: CreateGeographyNameDto) { return this.service.createGovernorate(dto.name); }
  @Post('governorates/:governorateId/centers') @ApiOperation({ summary: 'Create a center' }) center(@CurrentUser() _actor: RequestUser, @Param('governorateId') governorateId: string, @Body() dto: CreateGeographyNameDto) { return this.service.createCenter(governorateId, dto.name); }
  @Delete('centers/:id') @ApiOperation({ summary: 'Delete an unreferenced center' }) deleteCenter(@CurrentUser() _actor: RequestUser, @Param('id') id: string) { return this.service.deleteCenter(id); }
  @Delete('governorates/:id') @ApiOperation({ summary: 'Delete an unreferenced governorate' }) deleteGovernorate(@CurrentUser() _actor: RequestUser, @Param('id') id: string) { return this.service.deleteGovernorate(id); }
}

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { GrantEntitlementDto } from './dto/grant-entitlement.dto';
import { EntitlementsService } from './entitlements.service';

@ApiTags('admin/entitlements')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/entitlements', version: '1' })
export class EntitlementsController {
  constructor(private readonly service: EntitlementsService) {}
  @Post() grant(@CurrentUser() actor: RequestUser, @Body() dto: GrantEntitlementDto) { return this.service.grant(actor, dto); }
  @Post(':id/revoke') revoke(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.service.revoke(actor, id); }
  @Get() list(@CurrentUser() actor: RequestUser, @Query('studentUserId') studentUserId?: string) { return this.service.list(actor, studentUserId); }
}

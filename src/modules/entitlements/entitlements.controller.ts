import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { AdminEntitlementDto, GrantEntitlementDto, PaginatedAdminEntitlementsResponseDto, QueryEntitlementsDto } from './dto/grant-entitlement.dto';
import { EntitlementsService } from './entitlements.service';

@ApiTags('admin/entitlements')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/entitlements', version: '1' })
export class EntitlementsController {
  constructor(private readonly service: EntitlementsService) {}
  @Post() @ApiOperation({ summary: 'Grant a student entitlement' }) @ApiCreatedResponse({ type: AdminEntitlementDto }) grant(@CurrentUser() actor: RequestUser, @Body() dto: GrantEntitlementDto) { return this.service.grant(actor, dto); }
  @Post(':id/revoke') @ApiOperation({ summary: 'Revoke a student entitlement' }) @ApiOkResponse({ type: AdminEntitlementDto }) revoke(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.service.revoke(actor, id); }
  @Post('archived-access/:id/revoke') @ApiOperation({ summary: 'Revoke retained archived access for a student' }) revokeArchivedAccess(@CurrentUser() actor: RequestUser, @Param('id') id: string) { return this.service.revokeArchivedAccess(actor, id); }
  @Get() @ApiOperation({ summary: 'List student entitlements' }) @ApiOkResponse({ type: PaginatedAdminEntitlementsResponseDto }) list(@CurrentUser() actor: RequestUser, @Query() query: QueryEntitlementsDto) { return this.service.list(actor, query.studentUserId, query); }
}

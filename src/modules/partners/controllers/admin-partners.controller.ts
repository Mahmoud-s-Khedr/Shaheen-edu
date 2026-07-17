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
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Role } from '../../../common/types/roles.enum';
import { PartnersService } from '../partners.service';
import { CreatePartnerDto } from '../dto/create-partner.dto';
import { UpdatePartnerDto } from '../dto/update-partner.dto';
import type { RequestUser } from '../../../common/types/request-with-user.types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ApiStandardErrors } from '../../../common/decorators/api-standard-errors.decorator';
import {
  PaginatedPartnerResponseDto,
  PartnerSummaryDto,
} from '../../../common/dto/api-response.dto';

@ApiTags('admin/partners')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
@Controller({ path: 'admin/partners', version: '1' })
export class AdminPartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a partner account' })
  @ApiCreatedResponse({ type: PartnerSummaryDto })
  @ApiStandardErrors(400, 401, 403, 409)
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreatePartnerDto) {
    return this.partnersService.create(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List partner accounts',
    description: 'Returns partners newest first using offset pagination.',
  })
  @ApiOkResponse({ type: PaginatedPartnerResponseDto })
  @ApiStandardErrors(400, 401, 403)
  list(@Query() pagination: PaginationQueryDto) {
    return this.partnersService.list(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a partner by ID' })
  @ApiOkResponse({ type: PartnerSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  getById(@Param('id') id: string) {
    return this.partnersService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a partner profile' })
  @ApiOkResponse({ type: PartnerSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.partnersService.update(actor, id, dto);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend a partner and revoke sessions' })
  @ApiCreatedResponse({ type: PartnerSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  suspend(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.partnersService.suspend(actor, id);
  }

  @Post(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate a partner' })
  @ApiCreatedResponse({ type: PartnerSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  reactivate(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.partnersService.reactivate(actor, id);
  }
}

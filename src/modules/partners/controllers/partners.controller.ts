import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Role } from '../../../common/types/roles.enum';
import { PartnersService } from '../partners.service';
import type { RequestUser } from '../../../common/types/request-with-user.types';
import { ApiStandardErrors } from '../../../common/decorators/api-standard-errors.decorator';
import { PartnerSummaryDto } from '../../../common/dto/api-response.dto';
import { UpdatePartnerDto } from '../dto/update-partner.dto';

@ApiTags('partners')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.PARTNER)
@Controller({ path: 'partners', version: '1' })
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  /** Ownership is structural: never accepts an id param, keyed off req.user.id. */
  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated partner profile' })
  @ApiOkResponse({ type: PartnerSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  me(@CurrentUser() user: RequestUser) {
    return this.partnersService.getOwnProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated partner profile' })
  @ApiOkResponse({ type: PartnerSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404)
  updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdatePartnerDto) {
    return this.partnersService.updateOwnProfile(user.id, dto);
  }
}

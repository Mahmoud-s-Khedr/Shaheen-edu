import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Role } from '../../../common/types/roles.enum';
import { PartnersService } from '../partners.service';
import type { RequestUser } from '../../../common/types/request-with-user.types';

@ApiTags('partners')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.PARTNER)
@Controller({ path: 'partners', version: '1' })
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  /** Ownership is structural: never accepts an id param, keyed off req.user.id. */
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.partnersService.getOwnProfile(user.id);
  }
}

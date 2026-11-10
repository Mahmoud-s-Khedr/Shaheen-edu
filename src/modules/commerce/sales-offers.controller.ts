import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  SaveSalesOfferDto,
  SalesOfferAdminDto,
  StudentSalesOfferDto,
  StudentSalesOfferListDto,
} from './dto/sales-offer.dto';
import { SalesOffersService } from './sales-offers.service';
import { SalesOfferCoverAccessDto } from './dto/sales-offer-payment-review.dto';

@ApiTags('admin/sales-offers')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller({ path: 'admin/sales-offers', version: '1' })
export class SalesOffersController {
  constructor(private readonly offers: SalesOffersService) {}
  @Get()
  @ApiOperation({ summary: 'List sales offers' })
  @ApiOkResponse({ type: [SalesOfferAdminDto] })
  list(@CurrentUser() actor: RequestUser) {
    return this.offers.list(actor);
  }
  @Post()
  @ApiOperation({ summary: 'Create a sales offer' })
  @ApiCreatedResponse({ type: SalesOfferAdminDto })
  create(@CurrentUser() actor: RequestUser, @Body() dto: SaveSalesOfferDto) {
    return this.offers.save(actor, dto);
  }
  @Put(':id')
  @ApiOperation({ summary: 'Replace sales offer details' })
  @ApiOkResponse({ type: SalesOfferAdminDto })
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: SaveSalesOfferDto,
  ) {
    return this.offers.save(actor, dto, id);
  }
  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause a sales offer' })
  @ApiCreatedResponse({ type: SalesOfferAdminDto })
  pause(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.offers.status(actor, id, 'PAUSED');
  }
  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume a sales offer' })
  @ApiCreatedResponse({ type: SalesOfferAdminDto })
  resume(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.offers.status(actor, id, 'ACTIVE');
  }
  @Post(':id/end')
  @ApiOperation({ summary: 'Permanently end a sales offer' })
  @ApiCreatedResponse({ type: SalesOfferAdminDto })
  end(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.offers.status(actor, id, 'ENDED');
  }
}

@ApiTags('student/sales-offers')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/sales-offers', version: '1' })
export class StudentSalesOffersController {
  constructor(private readonly offers: SalesOffersService) {}

  @Get()
  @ApiOperation({
    summary: 'List offers available to the student and their owned content',
  })
  @ApiOkResponse({ type: StudentSalesOfferListDto })
  list(@CurrentUser() actor: RequestUser) {
    return this.offers.studentCatalog(actor.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View offer contents and availability' })
  @ApiOkResponse({ type: StudentSalesOfferDto })
  detail(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.offers.studentOffer(actor.id, id, undefined, false);
  }

  @Get(':id/cover')
  @ApiOperation({ summary: 'Get access to the offer cover image' })
  @ApiOkResponse({ type: SalesOfferCoverAccessDto })
  cover(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.offers.studentCover(actor.id, id);
  }
}

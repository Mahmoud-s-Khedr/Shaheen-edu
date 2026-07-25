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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  AgreementTargetDto,
  CreateEarningsStatementDto,
  CreatePublisherAgreementDto,
  EndPublisherAgreementDto,
  SetPricingDto,
  UpdatePublisherAgreementDto,
} from './dto/publisher-agreements.dto';
import { PublisherAgreementsService } from './publisher-agreements.service';

@ApiTags('admin/publisher-agreements')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/publisher-agreements', version: '1' })
export class PublisherAgreementsController {
  constructor(private readonly service: PublisherAgreementsService) {}
  @Post()
  @ApiOperation({ summary: 'Create a draft publisher agreement' })
  create(
    @CurrentUser() actor: RequestUser,
    @Body() dto: CreatePublisherAgreementDto,
  ) {
    return this.service.create(actor, dto);
  }
  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft publisher agreement' })
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePublisherAgreementDto,
  ) {
    return this.service.update(actor, id, dto);
  }
  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate a publisher agreement' })
  activate(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.service.activate(actor, id);
  }
  @Post(':id/end') @ApiOperation({ summary: 'End a publisher agreement' }) end(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: EndPublisherAgreementDto,
  ) {
    return this.service.end(actor, id, dto);
  }
  @Get() @ApiOperation({ summary: 'List publisher agreements' }) list(
    @CurrentUser() actor: RequestUser,
    @Query('history') history?: string,
  ) {
    return this.service.list(actor, history === 'true');
  }
  @Get('effective')
  @ApiOperation({ summary: 'Resolve the effective publisher agreement' })
  effective(
    @CurrentUser() actor: RequestUser,
    @Query() dto: AgreementTargetDto,
    @Query('at') at?: string,
  ) {
    return this.service.resolve(actor, dto, at ? new Date(at) : new Date());
  }
  @Post('earnings-statements')
  @ApiOperation({ summary: 'Create a publisher earnings statement' })
  statement(
    @CurrentUser() actor: RequestUser,
    @Body() dto: CreateEarningsStatementDto,
  ) {
    return this.service.createStatement(actor, dto);
  }
  @Get('earnings-statements')
  @ApiOperation({ summary: 'List publisher earnings statements' })
  statements(@CurrentUser() actor: RequestUser) {
    return this.service.listStatements(actor);
  }
}

@ApiTags('admin/pricing')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/pricing', version: '1' })
export class PricingController {
  constructor(private readonly service: PublisherAgreementsService) {}
  @Post('course/:id')
  @ApiOperation({ summary: 'Set course pricing' })
  setCourse(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetPricingDto,
  ) {
    return this.service.setPricing(actor, { courseId: id }, dto);
  }
  @Post('chapter/:id')
  @ApiOperation({ summary: 'Set chapter pricing' })
  setChapter(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetPricingDto,
  ) {
    return this.service.setPricing(actor, { chapterId: id }, dto);
  }
  @Post('lesson/:id')
  @ApiOperation({ summary: 'Set lesson pricing' })
  setLesson(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetPricingDto,
  ) {
    return this.service.setPricing(actor, { lessonId: id }, dto);
  }
  @Get('effective')
  @ApiOperation({ summary: 'Resolve effective pricing' })
  effective(
    @CurrentUser() actor: RequestUser,
    @Query() dto: AgreementTargetDto,
  ) {
    return this.service.resolvePricing(actor, dto);
  }
}

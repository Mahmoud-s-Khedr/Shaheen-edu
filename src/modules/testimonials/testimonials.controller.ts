import {
  Body,
  Controller,
  Delete,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { Role } from '../../common/types/roles.enum';
import {
  CreateTestimonialDto,
  QueryTestimonialDto,
  ReorderTestimonialDto,
  UpdateTestimonialDto,
} from './dto/testimonial.dto';
import { TestimonialsService } from './testimonials.service';

@ApiTags('admin/testimonials')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/testimonials', version: '1' })
export class TestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a testimonial draft' })
  @ApiCreatedResponse()
  @ApiStandardErrors(400, 401, 403, 409)
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateTestimonialDto) {
    return this.testimonials.create(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List testimonials for administration' })
  @ApiOkResponse()
  list(@CurrentUser() actor: RequestUser, @Query() query: QueryTestimonialDto) {
    return this.testimonials.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a testimonial for administration' })
  @ApiOkResponse()
  get(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.testimonials.get(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a testimonial' })
  @ApiOkResponse()
  @ApiStandardErrors(400, 401, 403, 404, 409)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateTestimonialDto,
  ) {
    return this.testimonials.update(actor, id, dto);
  }

  @Post('reorder')
  @ApiOperation({ summary: 'Atomically reorder non-archived testimonials' })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  reorder(
    @CurrentUser() actor: RequestUser,
    @Body() dto: ReorderTestimonialDto,
  ) {
    return this.testimonials.reorder(actor, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a testimonial' })
  @ApiOkResponse()
  publish(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.testimonials.publish(actor, id);
  }

  @Post(':id/unpublish')
  @ApiOperation({ summary: 'Return a published testimonial to draft' })
  @ApiOkResponse()
  unpublish(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.testimonials.unpublish(actor, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a testimonial' })
  @ApiOkResponse()
  archive(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.testimonials.archive(actor, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived testimonial as a draft' })
  @ApiOkResponse()
  restore(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.testimonials.restore(actor, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a testimonial draft' })
  @ApiStandardErrors(401, 403, 404, 409)
  delete(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.testimonials.delete(actor, id);
  }
}

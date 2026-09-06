import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TestimonialsService } from './testimonials.service';

@ApiTags('testimonials')
@Public()
@Controller({ path: 'testimonials', version: '1' })
export class PublicTestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Get()
  @ApiOperation({ summary: 'List published testimonials' })
  @ApiOkResponse()
  list(@Query() query: PaginationQueryDto) {
    return this.testimonials.listPublished(query);
  }

  @Get(':id/screenshot/access')
  @ApiOperation({
    summary: 'Get a short-lived URL for a published testimonial screenshot',
  })
  @ApiOkResponse()
  screenshotAccess(@Param('id') id: string) {
    return this.testimonials.screenshotAccess(id);
  }
}

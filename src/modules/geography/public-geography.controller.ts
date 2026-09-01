import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { GovernoratesQueryDto } from './dto/query-governorates.dto';
import { PaginatedGovernorateResponseDto } from './dto/geography-response.dto';
import { GeographyService } from './geography.service';

@ApiTags('geography')
@Public()
@Controller({ path: 'geography', version: '1' })
export class PublicGeographyController {
  constructor(private readonly service: GeographyService) {}

  @Get('governorates')
  @ApiOperation({
    summary: 'List governorates and centers for student registration',
  })
  @ApiOkResponse({ type: PaginatedGovernorateResponseDto })
  list(@Query() query: GovernoratesQueryDto) {
    return this.service.listGovernorates(query);
  }
}

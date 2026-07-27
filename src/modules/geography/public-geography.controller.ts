import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { GeographyService } from './geography.service';

@ApiTags('geography')
@Public()
@Controller({ path: 'geography', version: '1' })
export class PublicGeographyController {
  constructor(private readonly service: GeographyService) {}

  @Get('governorates')
  @ApiOperation({ summary: 'List governorates and centers for student registration' })
  list() { return this.service.listGovernorates(); }
}

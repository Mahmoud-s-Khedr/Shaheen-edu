import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import { PaginatedAcademicGradeResponseDto } from '../../common/dto/api-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AcademicGradesService } from './academic-grades.service';

@ApiTags('academic-grades')
@Public()
@Controller({ path: 'academic-grades', version: '1' })
export class PublicAcademicGradesController {
  constructor(private readonly academicGradesService: AcademicGradesService) {}

  @Get()
  @ApiOperation({
    summary: 'List published academic grades',
    description: 'Returns published academic grades for student registration.',
  })
  @ApiOkResponse({ type: PaginatedAcademicGradeResponseDto })
  @ApiStandardErrors(400)
  list(@Query() query: PaginationQueryDto) {
    return this.academicGradesService.listPublished(query);
  }
}

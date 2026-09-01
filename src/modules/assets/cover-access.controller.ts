import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalStudentAuthGuard } from '../../common/guards/optional-student-auth.guard';
import { AssetsService } from './assets.service';

@ApiTags('catalog/covers')
@Public()
@UseGuards(OptionalStudentAuthGuard)
@ApiBearerAuth()
@Controller({ path: 'catalog', version: '1' })
export class CoverAccessController {
  constructor(private readonly assets: AssetsService) {}

  @Get(':resource/:id/cover/access')
  @ApiOperation({
    summary: 'Get a protected URL for a visible hierarchy cover image',
  })
  access(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Req() request: any,
  ) {
    return this.assets.coverAccess(
      resource,
      id,
      request.user?.role === 'STUDENT' ? request.user.id : undefined,
    );
  }
}

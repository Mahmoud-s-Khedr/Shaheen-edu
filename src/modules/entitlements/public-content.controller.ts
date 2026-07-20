import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ContentAccessPolicyService } from './content-access-policy.service';

@ApiTags('catalog/content')
@Public()
@Controller({ path: 'catalog/content-items', version: '1' })
export class PublicContentController {
  constructor(private readonly policy: ContentAccessPolicyService) {}
  @Get(':id') get(@Param('id') id: string) { return this.policy.assertContentItemAccess(id); }
}

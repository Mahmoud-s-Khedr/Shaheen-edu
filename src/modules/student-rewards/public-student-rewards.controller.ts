import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { StudentRewardsSettingsResponseDto } from './dto/student-rewards.dto';
import { StudentRewardsService } from './student-rewards.service';

@ApiTags('student-rewards')
@Public()
@Controller({ path: 'student-rewards', version: '1' })
export class PublicStudentRewardsController {
  constructor(private readonly rewards: StudentRewardsService) {}

  @Get('settings')
  @ApiOperation({
    summary: 'Read public student credit and rewards configuration',
    description:
      'No authentication required. Returns the same version and config as the administrator settings GET, including defaults when settings have not been saved.',
  })
  @ApiOkResponse({ type: StudentRewardsSettingsResponseDto })
  settings() {
    return this.rewards.settings();
  }
}

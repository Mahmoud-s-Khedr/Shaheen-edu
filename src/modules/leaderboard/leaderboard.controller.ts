import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('student/leaderboard')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student/leaderboard', version: '1' })
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}
  @Get('current') current(
    @CurrentUser() user: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.leaderboard.current(user.id, query);
  }
  @Get('history/:weekKey') history(
    @CurrentUser() user: RequestUser,
    @Param('weekKey') weekKey: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.leaderboard.history(user.id, weekKey, query);
  }
}

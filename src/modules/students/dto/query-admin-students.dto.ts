import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { AccountStatus } from '../../../common/types/roles.enum';

export class QueryAdminStudentsDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches student name or phone.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  governorateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  centerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  academicGradeId?: string;
}

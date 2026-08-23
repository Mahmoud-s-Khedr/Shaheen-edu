import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PublisherAgreementStatus } from '../../../common/types/roles.enum';

export class PartnerPeriodQueryDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Cairo calendar date.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description: 'Cairo calendar date.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class PartnerEarningsQueryDto extends PartnerPeriodQueryDto {
  @ApiPropertyOptional({
    enum: ['day', 'month'],
    description: 'Defaults to day for ranges up to 93 days, otherwise month.',
  })
  @IsOptional()
  @IsEnum(['day', 'month'])
  granularity?: 'day' | 'month';
}

export class PartnerAllocationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01', description: 'Cairo calendar date.' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({ example: '2026-08-31', description: 'Cairo calendar date.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class PartnerContentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PublisherAgreementStatus })
  @IsOptional()
  @IsEnum(PublisherAgreementStatus)
  status?: PublisherAgreementStatus;
}

export class PartnerQuestionUsageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-08-31' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceId?: string;
}

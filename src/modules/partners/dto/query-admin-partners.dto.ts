import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PartnerType } from '../../../common/types/roles.enum';

/** Filters available on the administrative partner directory. */
export class QueryAdminPartnersDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({
    enum: PartnerType,
    description: 'Restricts results to a partner type.',
  })
  @IsOptional()
  @IsEnum(PartnerType)
  partnerType?: PartnerType;
}

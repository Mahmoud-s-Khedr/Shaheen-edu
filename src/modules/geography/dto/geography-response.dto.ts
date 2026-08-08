import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export class LocalizedNameDto {
  @ApiProperty({ example: 'القاهرة' })
  ar!: string;

  @ApiProperty({ example: 'Cairo' })
  en!: string;
}

export class CenterDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  governorateId!: string;

  @ApiProperty({ type: LocalizedNameDto })
  name!: LocalizedNameDto;
}

export class GovernorateDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: LocalizedNameDto })
  name!: LocalizedNameDto;

  @ApiProperty({ type: [CenterDto] })
  centers!: CenterDto[];
}

export class PaginatedGovernorateResponseDto {
  @ApiProperty({ type: [GovernorateDto] })
  data!: GovernorateDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

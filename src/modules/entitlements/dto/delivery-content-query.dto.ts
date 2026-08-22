import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/** Optional delivery expansions. Omitting the flag preserves the legacy shape. */
export class DeliveryContentQueryDto {
  @ApiPropertyOptional({
    enum: ['true'],
    description:
      'Include the optional ordered topics and concepts for a video.',
  })
  @IsOptional()
  @IsIn(['true'])
  includeVideoOutline?: 'true';
}

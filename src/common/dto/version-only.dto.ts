import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/** Shared body for publish/archive/restore/delete: caller's current version for optimistic concurrency. */
export class VersionOnlyDto {
  @ApiProperty({
    description: 'Current version for optimistic concurrency',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  version!: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayUnique, IsString } from 'class-validator';
export class UpdateTeacherScopeDto {
  @ApiProperty({
    type: [String],
    description: 'Complete replacement; [] removes all course access.',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  courseIds!: string[];
}

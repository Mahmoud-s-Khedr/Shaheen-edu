import { ApiProperty } from '@nestjs/swagger';
import { QuestionDifficultyBand } from '../../../common/types/roles.enum';

export class ContentPublisherSelectorDto {
  @ApiProperty() userId!: string;
  @ApiProperty() displayName!: string;
}

export class QuestionStatisticsDto {
  @ApiProperty() questionId!: string;
  @ApiProperty({ minimum: 0 }) totalResponses!: number;
  @ApiProperty({ minimum: 0 }) correctResponses!: number;
  @ApiProperty({ minimum: 0 }) incorrectResponses!: number;
  @ApiProperty({ type: Number, nullable: true }) incorrectRate!: number | null;
  @ApiProperty({ enum: QuestionDifficultyBand, nullable: true })
  difficultyBand!: QuestionDifficultyBand | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  calculatedAt!: Date | null;
}

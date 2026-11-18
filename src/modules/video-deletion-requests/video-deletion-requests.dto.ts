import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VideoDeletionDecision, VideoDeletionExecution } from '@prisma/client';
import { PaginationMetaDto } from '../../common/dto/api-response.dto';

export class VideoDeletionRequestResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() requesterId!: string;
  @ApiProperty() assetId!: string;
  @ApiProperty() contentItemId!: string;
  @ApiProperty() courseId!: string;
  @ApiProperty({
    type: Object,
    description:
      'Frozen title, status, filename, Bunny identifiers and upload state; retained after deletion.',
  })
  snapshot!: object;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: VideoDeletionDecision })
  decision!: VideoDeletionDecision;
  @ApiProperty({ enum: VideoDeletionExecution })
  execution!: VideoDeletionExecution;
  @ApiProperty({ type: String, nullable: true }) reviewerId!: string | null;
  @ApiProperty({ type: String, nullable: true }) decisionReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) failureDetails!: string | null;
  @ApiProperty() attempts!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
  @ApiPropertyOptional({
    type: Object,
    description:
      'Super admin detail only: current global references by model, each with count and ids.',
  })
  affectedReferences?: object;
}
export class VideoDeletionRequestPageDto {
  @ApiProperty({ type: [VideoDeletionRequestResponseDto] })
  data!: VideoDeletionRequestResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

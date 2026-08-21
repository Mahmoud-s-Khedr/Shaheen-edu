import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  QuestionImportMediaAssignmentOwner,
  QuestionImportMediaAssignmentStatus,
  QuestionImportMediaStatus,
  QuestionImportMediaType,
  QuestionImportStatus,
} from '../../../common/types/roles.enum';
import { QuestionPlacementDto } from '../../question-banks/dto/question-banks.dto';

export class CreateQuestionImportDto {
  @ApiProperty() @IsString() bankId!: string;
  @ApiProperty() @IsString() sourceId!: string;
  @ApiProperty() @IsString() courseId!: string;
  @ApiProperty({ type: [QuestionPlacementDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionPlacementDto)
  placements!: QuestionPlacementDto[];
  @ApiPropertyOptional({ description: 'Use either rawText or sourceAssetId.' })
  @IsOptional()
  @IsString()
  @MaxLength(5_000_000)
  rawText?: string;
  @ApiPropertyOptional({
    description: 'A ready PDF or TXT asset. Export DOCX files to PDF first.',
  })
  @IsOptional()
  @IsString()
  sourceAssetId?: string;
}

export class QueryQuestionImportDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ enum: QuestionImportStatus })
  @IsOptional()
  @IsEnum(QuestionImportStatus)
  status?: QuestionImportStatus;
}

export class UpdateQuestionImportSourceTextDto {
  @ApiProperty() @IsString() @MaxLength(500000) normalizedText!: string;
}
export class AcceptQuestionImportItemDto {
  @ApiProperty({
    description:
      'Corrected typed candidate. It must use one supported question type and batch-local evidence keys.',
  })
  @IsObject()
  candidate!: Record<string, unknown>;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
export class RejectQuestionImportItemDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) reason!: string;
}
export class QuestionImportItemMediaAssignmentDto {
  @ApiProperty() @IsString() mediaKey!: string;
  @ApiProperty({ enum: QuestionImportMediaAssignmentOwner })
  @IsEnum(QuestionImportMediaAssignmentOwner)
  owner!: QuestionImportMediaAssignmentOwner;
  @ApiProperty() @IsString() @MaxLength(100) ownerReference!: string;
  @ApiPropertyOptional({ description: 'START, END, or AFTER:B00001' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  placementAnchor?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
  @ApiProperty({ enum: QuestionImportMediaAssignmentStatus })
  @IsEnum(QuestionImportMediaAssignmentStatus)
  status!: QuestionImportMediaAssignmentStatus;
}
export class UpdateQuestionImportItemMediaAssignmentsDto {
  @ApiProperty({ type: [QuestionImportItemMediaAssignmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionImportItemMediaAssignmentDto)
  assignments!: QuestionImportItemMediaAssignmentDto[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class QuestionImportMediaBoundsDto {
  @ApiProperty({ minimum: 0, maximum: 1000 }) @IsInt() @Min(0) left!: number;
  @ApiProperty({ minimum: 0, maximum: 1000 }) @IsInt() @Min(0) top!: number;
  @ApiProperty({ minimum: 0, maximum: 1000 }) @IsInt() @Min(0) right!: number;
  @ApiProperty({ minimum: 0, maximum: 1000 }) @IsInt() @Min(0) bottom!: number;
}
export class CreateQuestionImportMediaDto {
  @ApiProperty() @IsInt() @Min(1) pageNumber!: number;
  @ApiProperty({ enum: QuestionImportMediaType })
  @IsEnum(QuestionImportMediaType)
  type!: QuestionImportMediaType;
  @ApiProperty({ type: QuestionImportMediaBoundsDto })
  @ValidateNested()
  @Type(() => QuestionImportMediaBoundsDto)
  bounds!: QuestionImportMediaBoundsDto;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;
}
export class UpdateQuestionImportMediaDto {
  @ApiPropertyOptional({ enum: QuestionImportMediaStatus })
  @IsOptional()
  @IsEnum(QuestionImportMediaStatus)
  status?: QuestionImportMediaStatus;
  @ApiPropertyOptional({ enum: QuestionImportMediaType })
  @IsOptional()
  @IsEnum(QuestionImportMediaType)
  type?: QuestionImportMediaType;
  @ApiPropertyOptional({ type: QuestionImportMediaBoundsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionImportMediaBoundsDto)
  bounds?: QuestionImportMediaBoundsDto;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

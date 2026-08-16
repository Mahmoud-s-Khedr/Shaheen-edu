import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { QuestionImportStatus } from '../../../common/types/roles.enum';
import { QuestionPlacementDto } from '../../question-banks/dto/question-banks.dto';

export class CreateQuestionImportDto {
  @ApiProperty() @IsString() bankId!: string;
  @ApiProperty() @IsString() sourceId!: string;
  @ApiProperty() @IsString() courseId!: string;
  @ApiProperty({ type: [QuestionPlacementDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuestionPlacementDto) placements!: QuestionPlacementDto[];
  @ApiPropertyOptional({ description: 'Use either rawText or sourceAssetId.' }) @IsOptional() @IsString() @MaxLength(5_000_000) rawText?: string;
  @ApiPropertyOptional({ description: 'A ready DOCX, text, or text-based PDF asset.' }) @IsOptional() @IsString() sourceAssetId?: string;
}

export class QueryQuestionImportDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ enum: QuestionImportStatus }) @IsOptional() @IsEnum(QuestionImportStatus) status?: QuestionImportStatus;
}

export class UpdateQuestionImportSourceTextDto { @ApiProperty() @IsString() @MaxLength(500000) normalizedText!: string; }

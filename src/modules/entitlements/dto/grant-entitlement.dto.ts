import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { EntitlementSource } from '../../../common/types/roles.enum';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export class QueryEntitlementsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentUserId?: string;
}

export class GrantEntitlementDto {
  @ApiProperty()
  @IsString()
  studentUserId!: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: GrantEntitlementDto) => !dto.chapterId)
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: GrantEntitlementDto) => !dto.courseId)
  @IsString()
  chapterId?: string;

  @ApiPropertyOptional({ enum: EntitlementSource, default: EntitlementSource.ADMIN })
  @IsOptional()
  @IsEnum(EntitlementSource)
  source?: EntitlementSource;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}

/** The admin-facing representation deliberately flattens related labels. */
export class AdminEntitlementDto {
  @ApiProperty() id!: string;
  @ApiProperty() studentUserId!: string;
  @ApiProperty({ type: String, nullable: true }) studentName!: string | null;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;
  @ApiProperty({ type: String, nullable: true }) chapterId!: string | null;
  @ApiProperty({ type: String, nullable: true }) targetName!: string | null;
  @ApiProperty({ type: String, nullable: true }) orderItemId!: string | null;
  @ApiProperty({ type: String, nullable: true }) orderItemName!: string | null;
  @ApiProperty({ enum: EntitlementSource }) source!: EntitlementSource;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) expiresAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) grantedById!: string | null;
  @ApiProperty({ type: String, nullable: true }) grantedByName!: string | null;
  @ApiProperty({ type: String, nullable: true }) revokedById!: string | null;
  @ApiProperty({ type: String, nullable: true }) revokedByName!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) revokedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class PaginatedAdminEntitlementsResponseDto {
  @ApiProperty({ type: [AdminEntitlementDto] }) data!: AdminEntitlementDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

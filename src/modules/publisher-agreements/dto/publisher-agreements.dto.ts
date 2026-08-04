import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AgreementTargetDto {
  @ApiPropertyOptional({ example: 'course-id', description: 'Provide exactly one target ID.' }) @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional({ example: 'chapter-id', description: 'Provide exactly one target ID.' }) @IsOptional() @IsString() chapterId?: string;
  @ApiPropertyOptional({ example: 'lesson-id', description: 'Provide exactly one target ID.' }) @IsOptional() @IsString() lessonId?: string;
}

export class CreatePublisherAgreementDto extends AgreementTargetDto {
  @ApiProperty({ example: 'publisher-user-id' }) @IsString() publisherUserId!: string;
  @ApiProperty({ example: 2500, minimum: 0, maximum: 10_000, description: 'Revenue share in basis points; 2500 = 25%.' }) @IsInt() @Min(0) @Max(10_000) revenueShareBps!: number;
  @ApiProperty({ type: String, format: 'date-time', example: '2026-08-01T00:00:00.000Z' }) @Type(() => Date) @IsDate() startsAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2026-12-31T23:59:59.000Z' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
  @ApiPropertyOptional({ example: true, default: true }) @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdatePublisherAgreementDto {
  @ApiPropertyOptional({ example: 'publisher-user-id' }) @IsOptional() @IsString() publisherUserId?: string;
  @ApiPropertyOptional({ example: 2500, minimum: 0, maximum: 10_000 }) @IsOptional() @IsInt() @Min(0) @Max(10_000) revenueShareBps?: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2026-08-01T00:00:00.000Z' }) @IsOptional() @Type(() => Date) @IsDate() startsAt?: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2026-12-31T23:59:59.000Z' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class EndPublisherAgreementDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2026-12-31T23:59:59.000Z', description: 'Defaults to the current time when omitted.' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
}

export class SetPricingDto {
  @ApiProperty({ example: true }) @IsBoolean() isPurchasable!: boolean;
  @ApiPropertyOptional({ example: 15000, minimum: 0, description: 'Required when isPurchasable is true; omit otherwise.' }) @ValidateIf((dto: SetPricingDto) => dto.isPurchasable) @IsInt() @Min(0) priceMinor?: number;
  @ApiPropertyOptional({ example: 'EGP', description: 'Required when isPurchasable is true; omit otherwise.' }) @ValidateIf((dto: SetPricingDto) => dto.isPurchasable) @IsString() currency?: string;
}

export class CreateEarningsStatementDto extends AgreementTargetDto {
  @ApiProperty({ type: String, format: 'date-time', example: '2026-08-01T00:00:00.000Z' }) @Type(() => Date) @IsDate() periodStartsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', example: '2026-08-31T23:59:59.000Z' }) @Type(() => Date) @IsDate() periodEndsAt!: Date;
  @ApiProperty({ example: 100000, minimum: 0 }) @IsInt() @Min(0) grossRevenueMinor!: number;
  @ApiProperty({ example: 'EGP' }) @IsString() currency!: string;
}

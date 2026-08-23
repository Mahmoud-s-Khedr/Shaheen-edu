import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ReferralCommissionKind } from '../../../common/types/roles.enum';

export class PublisherAgreementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ default: false, description: 'Include ended agreements.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  history = false;
}

export class AgreementTargetDto {
  @ApiPropertyOptional({ example: 'course-id', description: 'Provide exactly one target ID.' }) @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional({ example: 'chapter-id', description: 'Provide exactly one target ID.' }) @IsOptional() @IsString() chapterId?: string;
  @ApiPropertyOptional({ example: 'lesson-id', description: 'Provide exactly one target ID.' }) @IsOptional() @IsString() lessonId?: string;
}

export class CreatePublisherAgreementDto extends AgreementTargetDto {
  @ApiProperty({ example: 'publisher-user-id' }) @IsString() publisherUserId!: string;
  @ApiPropertyOptional({ enum: [ReferralCommissionKind.PERCENTAGE, ReferralCommissionKind.FIXED_PER_SALE] }) @IsOptional() @IsEnum(ReferralCommissionKind) payoutKind?: ReferralCommissionKind;
  @ApiPropertyOptional({ example: 2500, minimum: 0, maximum: 10_000 }) @IsOptional() @IsInt() @Min(0) @Max(10_000) revenueShareBps?: number;
  @ApiPropertyOptional({ example: 1500, minimum: 1 }) @IsOptional() @IsInt() @Min(1) fixedPayoutMinor?: number;
  @ApiProperty({ type: String, format: 'date-time', example: '2026-08-01T00:00:00.000Z' }) @Type(() => Date) @IsDate() startsAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2026-12-31T23:59:59.000Z' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
  @ApiPropertyOptional({ example: true, default: true }) @IsOptional() @IsBoolean() isPrimary?: boolean;
  @ApiPropertyOptional({ example: 'EGP', default: 'EGP' }) @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional({ example: 'PUB-2026-001' }) @IsOptional() @IsString() @MaxLength(120) contractReference?: string;
  @ApiPropertyOptional({ example: 'asset-id' }) @IsOptional() @IsString() signedDocumentAssetId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4_000) internalNote?: string;
}

export class UpdatePublisherAgreementDto {
  @ApiPropertyOptional({ example: 'publisher-user-id' }) @IsOptional() @IsString() publisherUserId?: string;
  @ApiPropertyOptional({ example: 2500, minimum: 0, maximum: 10_000 }) @IsOptional() @IsInt() @Min(0) @Max(10_000) revenueShareBps?: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2026-08-01T00:00:00.000Z' }) @IsOptional() @Type(() => Date) @IsDate() startsAt?: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2026-12-31T23:59:59.000Z' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean() isPrimary?: boolean;
  @ApiPropertyOptional({ enum: [ReferralCommissionKind.PERCENTAGE, ReferralCommissionKind.FIXED_PER_SALE] }) @IsOptional() @IsEnum(ReferralCommissionKind) payoutKind?: ReferralCommissionKind;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) fixedPayoutMinor?: number;
  @ApiPropertyOptional({ example: 'EGP' }) @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional({ example: 'PUB-2026-001' }) @IsOptional() @IsString() @MaxLength(120) contractReference?: string;
  @ApiPropertyOptional({ example: 'asset-id' }) @IsOptional() @IsString() signedDocumentAssetId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4_000) internalNote?: string;
}

/** A replacement creates a new immutable agreement version and ends the old one. */
export class ReplacePublisherAgreementDto extends CreatePublisherAgreementDto {
  @ApiPropertyOptional({ description: 'Activate the new version in the same transaction.', default: true })
  @IsOptional()
  @IsBoolean()
  activateImmediately = true;
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

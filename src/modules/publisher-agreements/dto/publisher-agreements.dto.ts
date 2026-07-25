import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

export class AgreementTargetDto {
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() chapterId?: string;
  @IsOptional() @IsString() lessonId?: string;
}

export class CreatePublisherAgreementDto extends AgreementTargetDto {
  @IsString() publisherUserId!: string;
  @IsInt() @Min(0) @Max(10_000) revenueShareBps!: number;
  @Type(() => Date) @IsDate() startsAt!: Date;
  @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdatePublisherAgreementDto {
  @IsOptional() @IsString() publisherUserId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) revenueShareBps?: number;
  @IsOptional() @Type(() => Date) @IsDate() startsAt?: Date;
  @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class EndPublisherAgreementDto {
  @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
}

export class SetPricingDto {
  @IsBoolean() isPurchasable!: boolean;
  @ValidateIf((dto: SetPricingDto) => dto.isPurchasable) @IsInt() @Min(0) priceMinor?: number;
  @ValidateIf((dto: SetPricingDto) => dto.isPurchasable) @IsString() currency?: string;
}

export class CreateEarningsStatementDto extends AgreementTargetDto {
  @Type(() => Date) @IsDate() periodStartsAt!: Date;
  @Type(() => Date) @IsDate() periodEndsAt!: Date;
  @IsInt() @Min(0) grossRevenueMinor!: number;
  @IsString() currency!: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CommerceTargetType, ManualPaymentSubmissionStatus } from '../../../common/types/roles.enum';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CartTargetDto {
  @ApiProperty({ enum: CommerceTargetType }) @IsEnum(CommerceTargetType) targetType!: CommerceTargetType;
  @ApiProperty() @IsString() targetId!: string;
}
export class CheckoutDto { @ApiProperty() @IsString() manualPaymentMethodId!: string; }
export class CreatePaymentMethodDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) titleAr!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) instructionsAr!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) titleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) instructionsEn?: string;
}
export class UpdatePaymentMethodDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) titleAr?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4000) instructionsAr?: string;
  @IsOptional() @IsString() @MaxLength(120) titleEn?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) instructionsEn?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class ReorderPaymentMethodsDto { @IsString({ each: true }) methodIds!: string[]; }
export class RejectPaymentDto { @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) rejectionReason!: string; }
export class PaymentSubmissionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ManualPaymentSubmissionStatus }) @IsOptional() @IsEnum(ManualPaymentSubmissionStatus) status?: ManualPaymentSubmissionStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() studentUserId?: string;
}
export class SubmitPaymentProofDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) transactionReference!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

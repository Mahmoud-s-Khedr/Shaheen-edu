import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  AssetKind,
  AssetStatus,
  CommerceTargetType,
  ManualPaymentSubmissionStatus,
  OrderStatus,
  PaymentChannel,
  PromotionKind,
} from '../../../common/types/roles.enum';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CartTargetDto {
  @ApiProperty({ enum: CommerceTargetType })
  @IsEnum(CommerceTargetType)
  targetType!: CommerceTargetType;
  @ApiProperty() @IsString() targetId!: string;
}
export class PricePreviewDto {
  @ApiProperty({ type: [CartTargetDto] })
  @ValidateNested({ each: true })
  @Type(() => CartTargetDto)
  targets!: CartTargetDto[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  couponCode?: string;
}
export class CheckoutDto {
  @ApiPropertyOptional({ enum: PaymentChannel, default: PaymentChannel.MANUAL })
  @IsOptional()
  @IsEnum(PaymentChannel)
  paymentChannel?: PaymentChannel;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manualPaymentMethodId?: string;
  @ApiPropertyOptional({ example: 'MIDTERMS25' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  couponCode?: string;
}
export class PromotionTargetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string;
}
export class CreateDiscountCampaignDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
  @ApiProperty({ enum: PromotionKind })
  @IsEnum(PromotionKind)
  kind!: PromotionKind;
  @ApiProperty({
    description: 'Basis points for PERCENTAGE, minor EGP units for FIXED',
  })
  @IsInt()
  @Min(1)
  amount!: number;
  @ApiProperty() @Type(() => Date) @IsDate() startsAt!: Date;
  @ApiProperty() @Type(() => Date) @IsDate() endsAt!: Date;
  @ApiPropertyOptional() @IsOptional() @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() appliesToAll?: boolean;
  @ApiPropertyOptional({ type: [PromotionTargetDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PromotionTargetDto)
  targets?: PromotionTargetDto[];
}
export class UpdateDiscountCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
  @ApiPropertyOptional({ enum: PromotionKind })
  @IsOptional()
  @IsEnum(PromotionKind)
  kind?: PromotionKind;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) amount?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;
  @ApiPropertyOptional() @IsOptional() @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() appliesToAll?: boolean;
  @ApiPropertyOptional({ type: [PromotionTargetDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PromotionTargetDto)
  targets?: PromotionTargetDto[];
}
export class CreateCouponDto extends CreateDiscountCampaignDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) code!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumOrderMinor?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maximumDiscountMinor?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) usageLimit?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  perStudentUsageLimit?: number;
}
export class UpdateCouponDto extends UpdateDiscountCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumOrderMinor?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maximumDiscountMinor?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) usageLimit?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  perStudentUsageLimit?: number;
}
export class CreatePaymentMethodDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) titleAr!: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  instructionsAr!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleEn?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructionsEn?: string;
}
export class UpdatePaymentMethodDto {
  @ApiPropertyOptional({ example: 'فودافون كاش' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  titleAr?: string;
  @ApiPropertyOptional({ example: 'حوّل المبلغ ثم ارفع الإيصال.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  instructionsAr?: string;
  @ApiPropertyOptional({ example: 'Vodafone Cash', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleEn?: string | null;
  @ApiPropertyOptional({
    example: 'Transfer the amount, then upload the receipt.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructionsEn?: string | null;
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class ReorderPaymentMethodsDto {
  @ApiProperty({
    type: [String],
    example: ['payment-method-id-1', 'payment-method-id-2'],
  })
  @IsString({ each: true })
  methodIds!: string[];
}
export class RejectPaymentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  rejectionReason!: string;
}
export class PaymentSubmissionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ManualPaymentSubmissionStatus })
  @IsOptional()
  @IsEnum(ManualPaymentSubmissionStatus)
  status?: ManualPaymentSubmissionStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() studentUserId?: string;
}
export class SubmitPaymentProofDto {
  @ApiProperty() @IsString() assetId!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  transactionReference?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** Response models deliberately mirror the values returned by CommerceService. */
export class MoneyDto {
  @ApiProperty({ example: 15000 }) amountMinor!: number;
  @ApiProperty({ example: 'EGP' }) currency!: string;
}

export class ManualPaymentMethodDto {
  @ApiProperty({ example: 'payment-method-id' }) id!: string;
  @ApiProperty({ example: 'فودافون كاش' }) titleAr!: string;
  @ApiProperty({ example: 'حوّل المبلغ ثم ارفع الإيصال.' })
  instructionsAr!: string;
  @ApiProperty({ type: String, example: 'Vodafone Cash', nullable: true })
  titleEn!: string | null;
  @ApiProperty({
    type: String,
    example: 'Transfer the amount, then upload the receipt.',
    nullable: true,
  })
  instructionsEn!: string | null;
  @ApiPropertyOptional({ example: true }) isActive?: boolean;
  @ApiPropertyOptional({ example: 1 }) sortOrder?: number;
  @ApiPropertyOptional({ example: 'admin-user-id' }) createdById?: string;
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:00:00.000Z',
  })
  createdAt?: Date;
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:00:00.000Z',
  })
  updatedAt?: Date;
}

export class ManualPaymentMethodsResponseDto {
  @ApiProperty({ type: [ManualPaymentMethodDto] })
  data!: ManualPaymentMethodDto[];
}

export class PaginatedManualPaymentMethodsResponseDto {
  @ApiProperty({ type: [ManualPaymentMethodDto] })
  data!: ManualPaymentMethodDto[];
  @ApiProperty({ example: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  meta!: { page: number; limit: number; total: number; totalPages: number };
}

export class CartItemDto {
  @ApiProperty({ example: 'cart-item-id' }) id!: string;
  @ApiProperty({ enum: CommerceTargetType, example: CommerceTargetType.COURSE })
  targetType!: CommerceTargetType;
  @ApiProperty({ example: 'course-id' }) targetId!: string;
  @ApiProperty({ example: 'Physics course' }) targetName!: string;
  @ApiProperty({ example: 'Physics course' }) title!: string;
  @ApiProperty({ type: MoneyDto }) price!: MoneyDto;
}

export class CartResponseDto {
  @ApiProperty({ type: [CartItemDto] }) data!: CartItemDto[];
  @ApiProperty({ type: MoneyDto }) total!: MoneyDto;
}

export class PaymentMethodSnapshotDto {
  @ApiProperty({ example: 'فودافون كاش' }) titleAr!: string;
  @ApiProperty({ example: 'حوّل المبلغ ثم ارفع الإيصال.' })
  instructionsAr!: string;
  @ApiProperty({ type: String, example: 'Vodafone Cash', nullable: true })
  titleEn!: string | null;
  @ApiProperty({
    type: String,
    example: 'Transfer the amount, then upload the receipt.',
    nullable: true,
  })
  instructionsEn!: string | null;
}

export class OrderItemDto {
  @ApiProperty({ example: 'order-item-id' }) id!: string;
  @ApiProperty({ enum: CommerceTargetType, example: CommerceTargetType.COURSE })
  targetType!: CommerceTargetType;
  @ApiProperty({ example: 'course-id' }) targetId!: string;
  @ApiProperty({ example: 'Physics course' }) targetName!: string;
  @ApiProperty({ example: 'Physics course' }) title!: string;
  @ApiProperty({ type: MoneyDto }) price!: MoneyDto;
}

export class PaymentSubmissionSummaryDto {
  @ApiProperty({ example: 'payment-submission-id' }) id!: string;
  @ApiProperty({ enum: ManualPaymentSubmissionStatus })
  status!: ManualPaymentSubmissionStatus;
  @ApiProperty({ type: String, example: 'TXN-12345', nullable: true })
  transactionReference!: string | null;
  @ApiProperty({ type: String, example: 'Receipt note', nullable: true })
  note!: string | null;
  @ApiProperty({
    type: String,
    example: 'Receipt is unreadable',
    nullable: true,
  })
  rejectionReason!: string | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:00:00.000Z',
  })
  createdAt!: Date;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:05:00.000Z',
    nullable: true,
  })
  reviewedAt!: Date | null;
}

export class OrderDto {
  @ApiProperty({ example: 'order-id' }) id!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty({ type: MoneyDto }) total!: MoneyDto;
  @ApiProperty({ type: PaymentMethodSnapshotDto })
  paymentMethod!: PaymentMethodSnapshotDto;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:00:00.000Z',
  })
  createdAt!: Date;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:30:00.000Z',
    nullable: true,
  })
  approvedAt!: Date | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:15:00.000Z',
    nullable: true,
  })
  cancelledAt!: Date | null;
  @ApiProperty({ type: [OrderItemDto] }) items!: OrderItemDto[];
  @ApiProperty({ type: [PaymentSubmissionSummaryDto] })
  submissions!: PaymentSubmissionSummaryDto[];
  @ApiPropertyOptional() paymentChannel?: PaymentChannel;
  @ApiPropertyOptional({ type: MoneyDto }) subtotal?: MoneyDto;
  @ApiPropertyOptional({ type: MoneyDto }) discount?: MoneyDto;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  paymentExpiresAt?: Date | null;
  @ApiPropertyOptional({ example: 'RCT-20260822-ORDER' }) receiptReference?:
    string | null;
}

export class PaginatedOrdersResponseDto {
  @ApiProperty({ type: [OrderDto] }) data!: OrderDto[];
  @ApiProperty({ example: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  meta!: { page: number; limit: number; total: number; totalPages: number };
}

export class IdDeletedResponseDto {
  @ApiProperty({ example: 'cart-item-id' }) id!: string;
  @ApiProperty({ example: true }) deleted!: boolean;
}
export class IdStatusResponseDto {
  @ApiProperty({ example: 'payment-submission-id' }) id!: string;
  @ApiProperty({ enum: ManualPaymentSubmissionStatus })
  status!: ManualPaymentSubmissionStatus;
}

export class PaymentSubmissionAdminDto {
  @ApiProperty({ example: 'payment-submission-id' }) id!: string;
  @ApiProperty({ enum: ManualPaymentSubmissionStatus })
  status!: ManualPaymentSubmissionStatus;
  @ApiProperty({ type: String, example: 'TXN-12345', nullable: true })
  transactionReference!: string | null;
  @ApiProperty({ example: 'order-id' }) orderId!: string;
  @ApiProperty({ enum: OrderStatus }) orderStatus!: OrderStatus;
  @ApiProperty({ example: 'student-user-id' }) studentUserId!: string;
  @ApiProperty({ example: 'Student name' }) studentName!: string;
  @ApiProperty({ type: MoneyDto }) total!: MoneyDto;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:00:00.000Z',
  })
  createdAt!: Date;
}

export class PaginatedPaymentSubmissionsResponseDto {
  @ApiProperty({ type: [PaymentSubmissionAdminDto] })
  data!: PaymentSubmissionAdminDto[];
  @ApiProperty({ example: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  meta!: { page: number; limit: number; total: number; totalPages: number };
}

export class ProtectedProofDto {
  @ApiProperty({ example: 'asset-id' }) id!: string;
  @ApiProperty({ example: 'receipt.png' }) filename!: string;
  @ApiProperty({ example: 'image/png' }) mimeType!: string;
  @ApiProperty({
    example: 'https://storage.example.test/protected/receipt.png',
  })
  url!: string;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:10:00.000Z',
  })
  expiresAt!: Date;
}

export class PaymentSubmissionDetailDto extends PaymentSubmissionSummaryDto {
  @ApiProperty({ type: OrderDto }) order!: OrderDto;
  @ApiProperty({ type: ProtectedProofDto }) proof!: ProtectedProofDto;
}

export class PaymentProofAssetDto {
  @ApiProperty({ example: 'asset-id' }) id!: string;
  @ApiProperty({ example: 'BUNNY_STORAGE' }) provider!: string;
  @ApiProperty({ enum: AssetKind, example: AssetKind.PAYMENT_PROOF })
  kind!: AssetKind;
  @ApiProperty({ enum: AssetStatus, example: AssetStatus.UPLOADING })
  status!: AssetStatus;
  @ApiProperty({ example: 'receipt.png' }) filename!: string;
  @ApiProperty({ example: 'image/png' }) mimeType!: string;
  @ApiProperty({ example: null, nullable: true }) sizeBytes!: number | null;
  @ApiProperty({ example: null, nullable: true }) checksum!: string | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:00:00.000Z',
  })
  createdAt!: Date;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: null,
    nullable: true,
  })
  readyAt!: Date | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: null,
    nullable: true,
  })
  failedAt!: Date | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: null,
    nullable: true,
  })
  archivedAt!: Date | null;
}

export class UploadInstructionDto {
  @ApiProperty({ example: 'https://storage.example.test/upload/signed-url' })
  url!: string;
  @ApiProperty({ example: 'PUT' }) method!: string;
  @ApiProperty({ example: { 'content-type': 'image/png' } }) headers!: Record<
    string,
    string
  >;
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T10:15:00.000Z',
  })
  expiresAt!: Date;
}

export class PaymentProofUploadAuthorizationResponseDto {
  @ApiProperty({ type: PaymentProofAssetDto }) asset!: PaymentProofAssetDto;
  @ApiProperty({ type: UploadInstructionDto }) upload!: UploadInstructionDto;
}
